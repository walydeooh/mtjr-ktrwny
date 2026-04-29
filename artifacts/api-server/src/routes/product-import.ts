import { Router, type IRouter } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { promises as dns } from "node:dns";
import net from "node:net";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const Body = z.object({ url: z.string().url() });

/**
 * Block private/internal IPs to prevent SSRF (Server-Side Request Forgery).
 * Resolves the hostname and rejects loopback, link-local, private, and metadata IPs.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  // Reject obvious metadata hostnames outright.
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower === "metadata.google.internal") {
    throw new Error("URL غير مسموح");
  }
  const records = await dns.lookup(hostname, { all: true });
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error("URL غير مسموح");
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map((x) => parseInt(x, 10));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. AWS/GCP metadata
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lc = ip.toLowerCase();
    if (lc === "::1" || lc === "::") return true;
    if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // ULA
    if (lc.startsWith("fe80")) return true; // link-local
    if (lc.startsWith("::ffff:")) {
      const v4 = lc.substring(7);
      return isPrivateIp(v4);
    }
    return false;
  }
  return true; // unknown family — be safe
}

/**
 * Scrape a product page and use AI to extract structured product info.
 *
 * Flow:
 *  1. Fetch the URL HTML.
 *  2. Try OpenGraph / common meta tags first (cheap, deterministic).
 *  3. If OPENAI_API_KEY is set, ask GPT to refine title/description/image
 *     from a trimmed snippet of the HTML body.
 *
 * Returns: { name, description, imageUrl, price?, sourceUrl }
 */
router.post("/products/import-from-url", requireAuth, async (req, res): Promise<void> => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رابط غير صالح" }); return; }
  const url = parsed.data.url;

  // SSRF guards: only http/https on standard or explicit ports, no private hosts.
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { res.status(400).json({ error: "رابط غير صالح" }); return; }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    res.status(400).json({ error: "البروتوكول غير مدعوم" });
    return;
  }
  try {
    await assertPublicHost(parsedUrl.hostname);
  } catch {
    res.status(400).json({ error: "النطاق غير مسموح" });
    return;
  }

  let html = "";
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MatjariBot/1.0; +https://matjari.replit.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "manual", // disable redirects to avoid SSRF via 3xx → private IP
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status >= 300 && r.status < 400) {
      res.status(400).json({ error: "إعادة التوجيه غير مدعومة" });
      return;
    }
    if (!r.ok) {
      res.status(502).json({ error: `فشل تحميل الصفحة (${r.status})` });
      return;
    }
    html = await r.text();
  } catch (e) {
    logger.warn({ err: (e as Error).message, url }, "product-import: fetch failed");
    res.status(502).json({ error: "تعذّر الوصول إلى الرابط" });
    return;
  }

  // --- 1) Cheap meta tag extraction
  const meta = (name: string, attr: "name" | "property" = "property"): string | null => {
    const re = new RegExp(`<meta\\s+${attr}=["']${name}["']\\s+content=["']([^"']*)["']`, "i");
    const m = html.match(re);
    if (m) return m[1] || null;
    const re2 = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+${attr}=["']${name}["']`, "i");
    const m2 = html.match(re2);
    return m2 ? m2[1] || null : null;
  };

  const title = meta("og:title") || meta("twitter:title", "name")
    || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null);
  const description = meta("og:description") || meta("description", "name") || meta("twitter:description", "name");
  let image = meta("og:image") || meta("twitter:image", "name") || meta("og:image:secure_url");
  // Resolve relative image URLs
  if (image && !/^https?:\/\//.test(image)) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = null;
    }
  }
  // Try to find a price in common formats
  const priceText = meta("product:price:amount") || meta("og:price:amount") || null;
  let price: number | null = priceText ? parseFloat(priceText) : null;

  // --- 2) AI refinement (optional)
  let aiName = title?.trim() || null;
  let aiDescription = description?.trim() || null;
  if (process.env["OPENAI_API_KEY"]) {
    try {
      // Strip tags, scripts, styles before feeding to AI to save tokens.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);

      const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد لاستخراج بيانات المنتجات من صفحات الويب. أعد JSON فقط بالحقول: name (اسم المنتج بالعربية إذا أمكن، وإلا بلغته)، description (وصف مختصر 1-3 جمل)، price (رقم بدون عملة، أو null). لا تخمّن إذا لم تجد القيمة، استخدم null.",
          },
          {
            role: "user",
            content: `عنوان الصفحة: ${title || ""}\nالوصف الميتا: ${description || ""}\n\nمحتوى مختصر من الصفحة:\n${text}`,
          },
        ],
        max_tokens: 400,
      });
      const raw = completion.choices[0]?.message?.content || "{}";
      const j = JSON.parse(raw) as { name?: string; description?: string; price?: number | null };
      if (j.name) aiName = j.name;
      if (j.description) aiDescription = j.description;
      if (typeof j.price === "number" && !isNaN(j.price)) price = j.price;
    } catch (e) {
      logger.warn({ err: (e as Error).message, url }, "product-import: AI extraction failed (using meta tags only)");
    }
  }

  res.json({
    name: aiName || "منتج بدون اسم",
    description: aiDescription || "",
    imageUrl: image || null,
    price: price ?? null,
    sourceUrl: url,
  });
});

export default router;
