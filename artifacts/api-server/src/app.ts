import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Production: serve the built React frontend ────────────────────────────────
if (process.env.NODE_ENV === "production") {
  // Resolve relative to the project root (CWD on Railway is the repo root)
  const staticDir = path.resolve(process.cwd(), "artifacts/store/dist/public");

  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));

    // SPA fallback — any route not matched above returns index.html
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });

    logger.info({ staticDir }, "Serving React frontend from static build");
  } else {
    logger.warn(
      { staticDir },
      "Static build directory not found — frontend will not be served",
    );
  }
}

export default app;
