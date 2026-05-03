import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { db, storeSettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/ai/test-connection", requireAuth, async (req, res): Promise<void> => {
  const body = (req.body || {}) as { provider?: string; model?: string; openaiApiKey?: string; geminiApiKey?: string };
  const rows = await db.select().from(storeSettingsTable);
  const s = rows[0];
  if (!s && !body.provider) { res.status(400).json({ error: "لم يتم إعداد المتجر بعد" }); return; }

  // Prefer transient values from request (so admin can test BEFORE saving), then DB, then env.
  const providerRaw = body.provider || s?.aiProvider || "openai";
  const provider = providerRaw === "gemini" ? "gemini" : providerRaw === "openai" ? "openai" : null;
  if (!provider) { res.status(400).json({ error: `مزوّد غير مدعوم: ${providerRaw}` }); return; }
  const model = body.model || s?.aiModel || (provider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash");

  try {
    if (provider === "openai") {
      const key = body.openaiApiKey || s?.aiOpenaiApiKey || process.env["OPENAI_API_KEY"];
      if (!key) { res.status(400).json({ error: "لم يتم إضافة مفتاح OpenAI" }); return; }
      const openai = new OpenAI({ apiKey: key });
      const r = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: "قل: اختبار ناجح" }],
        max_tokens: 20,
      });
      const text = r.choices[0]?.message?.content || "(لا رد)";
      res.json({ ok: true, message: `OpenAI (${model}) يعمل — الرد: ${text.trim()}` });
      return;
    }

    if (provider === "gemini") {
      const key = body.geminiApiKey || s?.aiGeminiApiKey || process.env["GEMINI_API_KEY"];
      if (!key) { res.status(400).json({ error: "لم يتم إضافة مفتاح Gemini" }); return; }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "قل: اختبار ناجح" }] }],
          generationConfig: { maxOutputTokens: 20 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
      if (!r.ok) { res.status(400).json({ error: data.error?.message || `Gemini API error (${r.status})` }); return; }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "(لا رد)";
      res.json({ ok: true, message: `Gemini (${model}) يعمل — الرد: ${text.trim()}` });
      return;
    }

    res.status(400).json({ error: `مزوّد غير مدعوم: ${provider as string}` });
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn({ err: msg, provider }, "ai-test: failed");
    res.status(400).json({ error: `فشل الاتصال: ${msg}` });
  }
});

export default router;
