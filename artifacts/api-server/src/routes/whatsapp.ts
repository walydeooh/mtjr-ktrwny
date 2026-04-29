import { Router, type IRouter } from "express";
import { db, autoRepliesTable, storeSettingsTable, ordersTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  SendWhatsappMessageBody,
  CreateAutoReplyBody,
  UpdateAutoReplyParams,
  UpdateAutoReplyBody,
  DeleteAutoReplyParams,
  ListWhatsappMessagesQueryParams,
} from "@workspace/api-zod";
import {
  getWhatsappStatus,
  getQrCode,
  initWhatsapp,
  disconnectWhatsapp,
  sendWhatsappMessage,
} from "../lib/whatsapp";
import { logger } from "../lib/logger";
import OpenAI from "openai";

const router: IRouter = Router();

const recentMessages: Array<{
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: string;
  fromMe: boolean;
  type: string;
}> = [];

const MAX_MESSAGES = 200;

async function handleIncomingMessage(msg: { from: string; body: string; id: string; timestamp: number; type: string }) {
  const messageRecord = {
    id: msg.id,
    from: msg.from,
    to: "me",
    body: msg.body,
    timestamp: new Date(msg.timestamp * 1000).toISOString(),
    fromMe: false,
    type: msg.type,
  };
  recentMessages.unshift(messageRecord);
  if (recentMessages.length > MAX_MESSAGES) recentMessages.pop();

  const [settings] = await db.select().from(storeSettingsTable);
  if (!settings?.whatsappAutoReply) return;

  const rules = await db.select().from(autoRepliesTable).where(eq(autoRepliesTable.active, true));
  const body = msg.body.toLowerCase().trim();

  let reply: string | null = null;

  for (const rule of rules) {
    if (body.includes(rule.trigger.toLowerCase())) {
      if (rule.isAi && settings.aiEnabled) {
        try {
          const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
          const products = await db.select().from(productsTable).where(eq(productsTable.active, true));
          const productsList = products.map(p => `- ${p.name}: ${p.price} ريال`).join("\n");
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `أنت مساعد متجر إلكتروني ذكي. المنتجات المتاحة:\n${productsList}\n\nأجب على رسائل العملاء بشكل ودي ومفيد باللغة العربية.`,
              },
              { role: "user", content: msg.body },
            ],
            max_tokens: 500,
          });
          reply = completion.choices[0]?.message?.content || rule.response;
        } catch (e) {
          logger.warn({ err: e }, "OpenAI error, using fallback reply");
          reply = rule.response;
        }
      } else {
        reply = rule.response;
      }
      break;
    }
  }

  if (!reply && body.includes("أبغى") || body.includes("اشتري") || body.includes("شراء") || body.includes("buy")) {
    const products = await db.select().from(productsTable).where(eq(productsTable.active, true));
    if (products.length > 0) {
      reply = "وش تبي تشتري؟ هذي المنتجات المتاحة:\n" + products.map(p => `- ${p.name}: ${p.price} ريال`).join("\n");
    }
  }

  // AI fallback: if AI is enabled and no rule matched, use OpenAI to answer.
  if (!reply && settings.aiEnabled && process.env["OPENAI_API_KEY"]) {
    try {
      const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
      const products = await db.select().from(productsTable).where(eq(productsTable.active, true));
      const productsList = products.slice(0, 50).map(p => `- ${p.name}: ${p.price} ريال`).join("\n");
      const sysPrompt = settings.aiSystemPrompt
        || `أنت مساعد متجر "${settings.storeName}" الذكي. أجب باللغة العربية بشكل مختصر وودي. المنتجات المتاحة:\n${productsList}`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: msg.body },
        ],
        max_tokens: 400,
      });
      reply = completion.choices[0]?.message?.content || null;
    } catch (e) {
      logger.warn({ err: e }, "AI fallback failed");
    }
  }

  if (reply) {
    try {
      await sendWhatsappMessage(msg.from, reply);
      recentMessages.unshift({
        id: `reply_${Date.now()}`,
        from: "me",
        to: msg.from,
        body: reply,
        timestamp: new Date().toISOString(),
        fromMe: true,
        type: "chat",
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to send auto-reply");
    }
  }
}

initWhatsapp(handleIncomingMessage).catch(e => logger.warn({ err: e }, "WhatsApp init failed on startup"));

router.get("/whatsapp/status", (_req, res): void => {
  res.json(getWhatsappStatus());
});

router.get("/whatsapp/qr", (_req, res): void => {
  res.json(getQrCode());
});

router.post("/whatsapp/disconnect", async (_req, res): Promise<void> => {
  await disconnectWhatsapp();
  res.json({ success: true });
});

router.get("/whatsapp/messages", (req, res): void => {
  const params = ListWhatsappMessagesQueryParams.safeParse(req.query);
  let msgs = recentMessages;
  if (params.success) {
    if (params.data.phone) {
      const phone = params.data.phone.replace(/[^0-9]/g, "");
      msgs = msgs.filter(m => m.from.includes(phone) || m.to.includes(phone));
    }
    if (params.data.limit) {
      msgs = msgs.slice(0, params.data.limit);
    }
  }
  res.json(msgs);
});

router.post("/whatsapp/send", async (req, res): Promise<void> => {
  const parsed = SendWhatsappMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await sendWhatsappMessage(parsed.data.phone, parsed.data.message);
    recentMessages.unshift({
      id: `sent_${Date.now()}`,
      from: "me",
      to: parsed.data.phone,
      body: parsed.data.message,
      timestamp: new Date().toISOString(),
      fromMe: true,
      type: "chat",
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get("/whatsapp/auto-replies", async (_req, res): Promise<void> => {
  const rules = await db.select().from(autoRepliesTable);
  res.json(rules.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/whatsapp/auto-replies", async (req, res): Promise<void> => {
  const parsed = CreateAutoReplyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rule] = await db.insert(autoRepliesTable).values({
    trigger: parsed.data.trigger,
    response: parsed.data.response,
    isAi: parsed.data.isAi ?? false,
    active: parsed.data.active !== undefined ? parsed.data.active : true,
  }).returning();
  res.status(201).json({ ...rule, createdAt: rule.createdAt.toISOString() });
});

router.patch("/whatsapp/auto-replies/:id", async (req, res): Promise<void> => {
  const params = UpdateAutoReplyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAutoReplyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rule] = await db.update(autoRepliesTable).set(parsed.data).where(eq(autoRepliesTable.id, params.data.id)).returning();
  if (!rule) {
    res.status(404).json({ error: "القاعدة غير موجودة" });
    return;
  }
  res.json({ ...rule, createdAt: rule.createdAt.toISOString() });
});

router.delete("/whatsapp/auto-replies/:id", async (req, res): Promise<void> => {
  const params = DeleteAutoReplyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(autoRepliesTable).where(eq(autoRepliesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
