import { Router, type IRouter } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { promises as dns } from "node:dns";
import net from "node:net";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { db, productsTable } from "@workspace/db";

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

/* ─────────────────────────────────────────────────────────────────────────────
   POST /products/import-from-site
   Scrape an entire store, extract all visible products with AI, save as hidden.
───────────────────────────────────────────────────────────────────────────── */
const BulkImportBody = z.object({
  url: z.string().url(),
  maxProducts: z.coerce.number().int().min(1).max(50).default(20),
});

interface AIProduct {
  name: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}

function formatImportedProduct(p: typeof productsTable.$inferSelect) {
  return { ...p, price: parseFloat(p.price as unknown as string), createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() };
}

router.post("/products/import-from-site", requireAuth, async (req, res): Promise<void> => {
  const parsed = BulkImportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رابط غير صالح" }); return; }

  const { url, maxProducts } = parsed.data;

  // SSRF guard
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { res.status(400).json({ error: "رابط غير صالح" }); return; }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    res.status(400).json({ error: "البروتوكول غير مدعوم" }); return;
  }
  try { await assertPublicHost(parsedUrl.hostname); } catch {
    res.status(400).json({ error: "النطاق غير مسموح" }); return;
  }

  // ── 1. Fetch page content ──────────────────────────────────────────────────
  let html = "";
  const capturedImages: { src: string; alt: string }[] = [];

  // Try Puppeteer first (handles JS-rendered stores like Salla/Zid)
  let puppeteerOk = false;
  try {
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      timeout: 30_000,
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 22_000 });
      // scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise<void>(r => setTimeout(r, 2000));
      html = await page.content();
      // capture rendered img src values
      const imgs = await page.$$eval("img[src]", (els: Element[]) =>
        (els as HTMLImageElement[]).map(e => ({ src: e.src || "", alt: e.alt || "" })).filter(i => i.src.startsWith("http"))
      );
      capturedImages.push(...imgs);
      puppeteerOk = true;
    } finally {
      await browser.close();
    }
  } catch (puppeteerErr) {
    logger.warn({ err: (puppeteerErr as Error).message, url }, "bulk-import: Puppeteer unavailable, falling back to fetch");
  }

  if (!puppeteerOk) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MatjariBot/1.0)", Accept: "text/html" },
        signal: AbortSignal.timeout(15_000),
        redirect: "manual",
      });
      if (r.status >= 300 && r.status < 400) { res.status(400).json({ error: "إعادة التوجيه غير مدعومة" }); return; }
      if (!r.ok) { res.status(502).json({ error: `فشل تحميل الصفحة (${r.status})` }); return; }
      html = await r.text();
    } catch {
      res.status(502).json({ error: "تعذّر الوصول إلى الموقع" }); return;
    }
  }

  // ── 2. JSON-LD structured data extraction (most reliable) ─────────────────
  function collectAllProducts(node: unknown, out: Record<string, unknown>[]): void {
    if (!node) return;
    if (Array.isArray(node)) { for (const n of node) collectAllProducts(n, out); return; }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    const types = Array.isArray(t) ? t : [t];
    if (types.some(x => typeof x === "string" && x.toLowerCase() === "product")) out.push(obj);
    if (obj["@graph"]) collectAllProducts(obj["@graph"], out);
  }

  const ldProducts: AIProduct[] = [];
  const ldRe2 = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(ldRe2)) {
    try {
      const data = JSON.parse((m[1] || "").trim());
      const nodes: Record<string, unknown>[] = [];
      collectAllProducts(data, nodes);
      for (const p of nodes) {
        if (typeof p["name"] !== "string" || !p["name"]) continue;
        let img: string | null = null;
        const imgVal = p["image"];
        if (typeof imgVal === "string") img = imgVal;
        else if (Array.isArray(imgVal) && typeof imgVal[0] === "string") img = imgVal[0];
        else if (imgVal && typeof imgVal === "object") img = (imgVal as Record<string, unknown>)["url"] as string ?? null;
        const offer = priceFromOffer(p["offers"]);
        ldProducts.push({ name: p["name"] as string, description: (p["description"] as string) ?? null, price: offer?.price ?? null, imageUrl: img });
      }
    } catch { /* bad JSON-LD */ }
  }

  // ── 2b. Microdata extraction (itemscope / itemprop) ───────────────────────
  const microdataProducts: AIProduct[] = [];
  // Find all elements with itemtype containing "schema.org/Product"
  const microdataRe = /itemtype=["'][^"']*schema\.org\/Product["'][^>]*>([\s\S]*?)(?=itemtype=["'][^"']*schema\.org\/Product["']|$)/gi;
  for (const m of html.matchAll(microdataRe)) {
    const block = m[0] || "";
    const nameM = block.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']|itemprop=["']name["'][^>]*>([^<]+)</i);
    const priceM = block.match(/itemprop=["']price["'][^>]*content=["']([0-9.,]+)["']|itemprop=["']price["'][^>]*>([0-9.,]+)/i);
    const imgM = block.match(/itemprop=["']image["'][^>]*(?:content|src)=["']([^"']+)["']/i);
    const descM = block.match(/itemprop=["']description["'][^>]*content=["']([^"']+)["']|itemprop=["']description["'][^>]*>([^<]+)</i);
    const name = (nameM?.[1] || nameM?.[2] || "").trim();
    if (!name) continue;
    const priceRaw = (priceM?.[1] || priceM?.[2] || "").replace(/,/g, "").trim();
    const price = priceRaw ? parseFloat(priceRaw) : null;
    microdataProducts.push({
      name,
      description: (descM?.[1] || descM?.[2] || null),
      price: price && !isNaN(price) ? price : null,
      imageUrl: imgM?.[1] || null,
    });
  }

  // ── 2c. Salla / Zid platform detection & API fallback ────────────────────
  // Salla stores embed all products as JS variables that follow predictable patterns.
  const sallaProductsRe = /"products"\s*:\s*(\[[\s\S]*?\])\s*[,}]/;
  const sallaMatch = html.match(sallaProductsRe);
  const platformProducts: AIProduct[] = [];
  if (sallaMatch) {
    try {
      const arr = JSON.parse(sallaMatch[1]) as Record<string, unknown>[];
      for (const p of arr) {
        const name = String(p["name"] || p["title"] || "").trim();
        if (!name) continue;
        const priceRaw = p["price"] ?? p["regular_price"] ?? p["sale_price"];
        let price: number | null = null;
        if (typeof priceRaw === "number") price = priceRaw;
        else if (typeof priceRaw === "string") price = parseFloat(priceRaw) || null;
        else if (priceRaw && typeof priceRaw === "object") {
          const amount = (priceRaw as Record<string, unknown>)["amount"];
          price = typeof amount === "number" ? amount : (typeof amount === "string" ? parseFloat(amount) : null);
        }
        const imgRaw = p["thumbnail"] ?? p["image"] ?? p["main_image"];
        const imageUrl = typeof imgRaw === "string" ? imgRaw :
          (imgRaw && typeof imgRaw === "object" ? String((imgRaw as Record<string, unknown>)["url"] ?? "") : null);
        platformProducts.push({ name, description: String(p["description"] || "").trim() || null, price, imageUrl: imageUrl || null });
      }
    } catch { /* ignore */ }
  }

  // ── 3. AI extraction ───────────────────────────────────────────────────────
  let aiProducts: AIProduct[] = [];
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14_000);

  const aiSystemPrompt = `أنت أداة استخراج بيانات من صفحات المتاجر الإلكترونية.
استخرج كل المنتجات الظاهرة في الصفحة وأعد JSON فقط بهذا الشكل:
{"products":[{"name":"اسم المنتج","description":"الوصف الكامل للمنتج","price":99.99,"imageUrl":"https://..."}]}
- price: رقم بدون عملة (null إذا غير موجود)
- imageUrl: الرابط الكامل للصورة أو null (لا تخترع روابط)
- لا تضف منتجات وهمية - استخرج الحقيقية فقط
- إذا كانت الصفحة تحتوي منتجات متعددة استخرج كلها`;

  const aiUserMsg = `URL: ${url}\n\nمحتوى الصفحة:\n${cleanText}`;

  if (process.env["OPENAI_API_KEY"]) {
    try {
      const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: aiSystemPrompt }, { role: "user", content: aiUserMsg }],
        max_tokens: 4000,
      });
      const raw = completion.choices[0]?.message?.content || "{}";
      const j = JSON.parse(raw) as { products?: AIProduct[] };
      if (Array.isArray(j.products)) aiProducts = j.products;
    } catch (e) {
      logger.warn({ err: (e as Error).message, url }, "bulk-import: OpenAI extraction failed");
    }
  } else if (process.env["ANTHROPIC_API_KEY"]) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
      const msg = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: `${aiSystemPrompt}\n\n${aiUserMsg}` }],
      });
      const txt = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) {
        const j = JSON.parse(match[0]) as { products?: AIProduct[] };
        if (Array.isArray(j.products)) aiProducts = j.products;
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, url }, "bulk-import: Anthropic extraction failed");
    }
  }

  // ── 4. Merge: JSON-LD > Microdata > Platform > AI ────────────────────────
  const merged = new Map<string, AIProduct>();
  for (const p of [...ldProducts, ...microdataProducts, ...platformProducts, ...aiProducts]) {
    if (!p.name?.trim()) continue;
    const key = p.name.trim().toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, p);
    } else {
      const ex = merged.get(key)!;
      merged.set(key, {
        name: ex.name,
        description: ex.description || p.description,
        price: ex.price ?? p.price,
        imageUrl: ex.imageUrl || p.imageUrl,
      });
    }
  }

  const toInsert = [...merged.values()].slice(0, maxProducts);
  if (toInsert.length === 0) {
    res.json({ imported: 0, products: [], message: "لم يتم العثور على منتجات في هذه الصفحة. تأكد من أن الرابط هو صفحة المنتجات أو الصفحة الرئيسية للمتجر." });
    return;
  }

  // Build image lookup from captured Puppeteer images
  const imgByAlt = new Map<string, string>();
  for (const img of capturedImages) {
    if (img.alt?.trim()) imgByAlt.set(img.alt.trim().toLowerCase(), img.src);
  }

  function resolveUrl(raw: string | null | undefined, base: string): string | null {
    if (!raw?.trim()) return null;
    try { return new URL(raw, base).toString(); } catch { return null; }
  }

  // ── 5. Bulk insert with active=false ───────────────────────────────────────
  const saved = [];
  for (const p of toInsert) {
    const img = resolveUrl(p.imageUrl, url) ?? imgByAlt.get(p.name.trim().toLowerCase()) ?? null;
    try {
      const [product] = await db.insert(productsTable).values({
        name: p.name.trim().slice(0, 255),
        description: p.description?.trim().slice(0, 4000) || null,
        price: String(Math.max(0, p.price ?? 0)),
        imageUrl: img,
        active: false,
        type: "physical",
        sourceUrl: url,
      } as never).returning();
      saved.push(formatImportedProduct(product));
    } catch (insertErr) {
      logger.warn({ err: (insertErr as Error).message, name: p.name }, "bulk-import: insert failed");
    }
  }

  res.json({
    imported: saved.length,
    products: saved,
    message: `تم استيراد ${saved.length} منتج بنجاح — جميعها مخفية حتى تقوم بعرضها`,
  });
});

export default router;
