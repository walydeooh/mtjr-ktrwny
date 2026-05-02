import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

// In production build BASE_PATH and PORT default to safe values.
// In dev they must be supplied by the workflow.
const rawPort = process.env.PORT ?? (isProduction ? "3000" : undefined);
const basePath = process.env.BASE_PATH ?? (isProduction ? "/" : undefined);

if (!rawPort && !isProduction) {
  throw new Error("PORT environment variable is required in dev mode.");
}
if (!basePath && !isProduction) {
  throw new Error("BASE_PATH environment variable is required in dev mode.");
}

const port = Number(rawPort ?? "3000");

const replPlugins =
  !isProduction && process.env.REPL_ID !== undefined
    ? [
        await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
          m.default()
        ),
        await import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer({
            root: path.resolve(import.meta.dirname, ".."),
          })
        ),
        await import("@replit/vite-plugin-dev-banner").then((m) =>
          m.devBanner()
        ),
      ]
    : [];

export default defineConfig({
  base: basePath ?? "/",
  plugins: [react(), tailwindcss(), ...replPlugins],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets"
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: { strict: true },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
