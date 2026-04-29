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

  // --- 1) Structured data extraction (JSON-LD Product schema is the gold standard)
  let ldName: string | null = null;
  let ldDescription: string | null = null;
  let ldImage: string | null = null;
  let ldPrice: number | null = null;
  let ldCurrency: string | null = null;

  // Walk a JSON-LD value tree and collect Product nodes (handles @graph, arrays, nested).
  function collectProducts(node: unknown, out: Record<string, unknown>[]): void {
    if (!node) return;
    if (Array.isArray(node)) { for (const n of node) collectProducts(n, out); return; }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    const types = Array.isArray(t) ? t : [t];
    if (types.includes("Product")) out.push(obj);
    if (obj["@graph"]) collectProducts(obj["@graph"], out);
  }
  // Pull a numeric price + currency from an Offer (or AggregateOffer) node.
  // Preference order: lowPrice (sale) > price > highPrice — so discounted price wins.
  function priceFromOffer(offer: unknown): { price: number; currency: string | null } | null {
    if (!offer) return null;
    if (Array.isArray(offer)) {
      for (const o of offer) { const p = priceFromOffer(o); if (p) return p; }
      return null;
    }
    if (typeof offer !== "object") return null;
    const o = offer as Record<string, unknown>;
    const cur = typeof o["priceCurrency"] === "string" ? (o["priceCurrency"] as string) : null;
    const candidates = [o["lowPrice"], o["price"], o["highPrice"]];
    for (const c of candidates) {
      if (typeof c === "number" && !isNaN(c) && c > 0) return { price: c, currency: cur };
      if (typeof c === "string") { const n = parseFloat(c); if (!isNaN(n) && n > 0) return { price: n, currency: cur }; }
    }
    return null;
  }
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(ldRe)) {
    try {
      const data = JSON.parse((m[1] || "").trim());
      const products: Record<string, unknown>[] = [];
      collectProducts(data, products);
      for (const p of products) {
        if (!ldName && typeof p["name"] === "string") ldName = p["name"] as string;
        if (!ldDescription && typeof p["description"] === "string") ldDescription = p["description"] as string;
        if (!ldImage) {
          const img = p["image"];
          if (typeof img === "string") ldImage = img;
          else if (Array.isArray(img) && typeof img[0] === "string") ldImage = img[0];
          else if (img && typeof img === "object" && typeof (img as Record<string, unknown>)["url"] === "string") {
            ldImage = (img as Record<string, unknown>)["url"] as string;
          }
        }
        if (ldPrice === null) {
          const pr = priceFromOffer(p["offers"]);
          if (pr) { ldPrice = pr.price; ldCurrency = pr.currency; }
        }
      }
    } catch { /* ignore broken JSON-LD blocks */ }
  }

  // --- 1b) Detect store's display currency + exchange rate (handles multi-currency stores
  // like Salla where structured data is in USD but the customer sees SAR).
  // We look for hints embedded in the page JS:
  //   "exchangeRate":"3.7506..."  → conversion factor to apply to USD-priced data
  //   "store_country":"SA"        → store's home country (maps to currency)
  //   "currencies":{"SAR":{...,"amount":1},"USD":{...,"amount":0.2666}}  → multi-currency table
  const storeCountryMatch = html.match(/"store_country"\s*:\s*"([A-Z]{2})"/);
  const exchangeRateMatch = html.match(/"exchangeRate"\s*:\s*"?([\d.]+)"?/);
  const dataCurrencyMatch = html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/);

  // Map common Arab country codes → currency for Salla-style stores.
  const COUNTRY_TO_CURRENCY: Record<string, string> = {
    SA: "SAR", AE: "AED", KW: "KWD", BH: "BHD", QA: "QAR", OM: "OMR",
    EG: "EGP", JO: "JOD", IQ: "IQD", LB: "LBP", YE: "YER", LY: "LYD",
    DZ: "DZD", MA: "MAD", TN: "TND", SD: "SDG", US: "USD", GB: "GBP",
  };
  const storeCurrency = storeCountryMatch ? COUNTRY_TO_CURRENCY[storeCountryMatch[1]!] || null : null;
  const dataCurrency = dataCurrencyMatch ? dataCurrencyMatch[1]! : null;
  const exchangeRate = exchangeRateMatch ? parseFloat(exchangeRateMatch[1]!) : null;

  // Convert a structured-data price into the store's display currency, if needed.
  function convertToStoreCurrency(amount: number, fromCurrency: string | null): number {
    if (!storeCurrency || !fromCurrency) return amount;
    if (fromCurrency === storeCurrency) return amount;
    // Salla pages embed an exchangeRate where the rate is "1 dataCurrency = N storeCurrency".
    if (exchangeRate && fromCurrency === dataCurrency) {
      return Math.round(amount * exchangeRate * 100) / 100;
    }
    // Try the multi-currency table: currencies.<code>.amount = price ratio relative to store currency.
    const entryRe = new RegExp(`"${fromCurrency}"\\s*:\\s*\\{[^}]*"amount"\\s*:\\s*([0-9.]+)`);
    const em = html.match(entryRe);
    if (em) {
      const ratio = parseFloat(em[1]!);
      if (ratio > 0) return Math.round((amount / ratio) * 100) / 100;
    }
    return amount; // unknown — keep as-is rather than guess
  }

  if (ldPrice !== null) ldPrice = convertToStoreCurrency(ldPrice, ldCurrency);

  // --- 2) Meta tag fallback
  const meta = (name: string, attr: "name" | "property" = "property"): string | null => {
    const re = new RegExp(`<meta\\s+${attr}=["']${name}["']\\s+content=["']([^"']*)["']`, "i");
    const m = html.match(re);
    if (m) return m[1] || null;
    const re2 = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+${attr}=["']${name}["']`, "i");
    const m2 = html.match(re2);
    return m2 ? m2[1] || null : null;
  };

  const title = ldName
    || meta("og:title")
    || meta("twitter:title", "name")
    || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null);
  // Prefer JSON-LD description (usually long) over meta (often the short title).
  // Only fall back to meta description if it's clearly different from the title (i.e. real content).
  let description = ldDescription;
  if (!description) {
    const metaDesc = meta("og:description") || meta("description", "name") || meta("twitter:description", "name");
    if (metaDesc && metaDesc.trim() !== (title || "").trim()) description = metaDesc;
  }
  let image = ldImage || meta("og:image") || meta("twitter:image", "name") || meta("og:image:secure_url");
  // Resolve relative image URLs
  if (image && !/^https?:\/\//.test(image)) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = null;
    }
  }
  // Price priority: JSON-LD > sale_price (discounted) > price (original) > og:price.
  // Each meta tag may carry its own currency declaration that needs converting.
  const salePriceText = meta("product:sale_price:amount");
  const salePriceCur = meta("product:sale_price:currency");
  const priceText = meta("product:price:amount") || meta("og:price:amount") || null;
  const priceCur = meta("product:price:currency") || meta("og:price:currency") || null;
  let price: number | null = ldPrice;
  if (price === null && salePriceText) {
    const n = parseFloat(salePriceText);
    if (!isNaN(n) && n > 0) price = convertToStoreCurrency(n, salePriceCur);
  }
  if (price === null && priceText) {
    const n = parseFloat(priceText);
    if (!isNaN(n) && n > 0) price = convertToStoreCurrency(n, priceCur);
  }

  // --- 3) AI refinement (only fills GAPS — never overwrites trustworthy structured data).
  // If JSON-LD already gave us a long, real description, we keep it as-is.
  let finalName = title?.trim() || null;
  let finalDescription = description?.trim() || null;
  const descIsWeak = !finalDescription || finalDescription.length < 40 || finalDescription === finalName;

  if (process.env["OPENAI_API_KEY"] && (descIsWeak || !finalName || price === null)) {
    try {
      // Strip tags, scripts, styles before feeding to AI to save tokens.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد لاستخراج بيانات المنتجات من صفحات الويب. أعد JSON فقط بالحقول: name (اسم المنتج كما هو من الصفحة)، description (الوصف الكامل والمفصّل للمنتج كما هو في الصفحة، يشمل المميزات والشروط والملاحظات إن وُجدت — لا تختصره ولا تكرر الاسم)، price (رقم بدون عملة، أو null). إذا لم تجد قيمة فعلية في النص استخدم null. لا تكرر الاسم في الوصف.",
          },
          {
            role: "user",
            content: `عنوان الصفحة: ${title || ""}\nالوصف الميتا: ${description || ""}\n\nمحتوى الصفحة:\n${text}`,
          },
        ],
        max_tokens: 800,
      });
      const raw = completion.choices[0]?.message?.content || "{}";
      const j = JSON.parse(raw) as { name?: string; description?: string; price?: number | null };
      // Only overwrite if AI's value is meaningfully better.
      if (!finalName && j.name) finalName = j.name.trim();
      if (descIsWeak && j.description && j.description.trim().length > (finalDescription?.length ?? 0)) {
        finalDescription = j.description.trim();
      }
      if (price === null && typeof j.price === "number" && !isNaN(j.price) && j.price > 0) price = j.price;
    } catch (e) {
      logger.warn({ err: (e as Error).message, url }, "product-import: AI extraction failed (using structured data only)");
    }
  }

  // Final guard: if description ended up identical to name, drop it.
  if (finalDescription && finalName && finalDescription.trim() === finalName.trim()) {
    finalDescription = null;
  }

  res.json({
    name: finalName || "منتج بدون اسم",
    description: finalDescription || "",
    imageUrl: image || null,
    price: price ?? null,
    sourceUrl: url,
  });
});

export default router;
