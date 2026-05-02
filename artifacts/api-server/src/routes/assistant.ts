import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, productsTable, digitalCodesTable, ordersTable } from "@workspace/db";
import type Anthropic from "@anthropic-ai/sdk";
type MessageParam = Anthropic.MessageParam;
type Tool = Anthropic.Tool;
type ToolUseBlock = Anthropic.ToolUseBlock;
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// --- Tool definitions exposed to Claude.
// Keep these intentionally narrow (read + targeted write) so the assistant can
// only do what the dashboard owner already has buttons for.
const tools: Tool[] = [
  {
    name: "find_products",
    description: "ابحث عن منتجات بالاسم العربي أو جزء منه. يعيد قائمة بمعرّف المنتج واسمه ونوعه. استخدمها قبل أي عملية تحتاج معرّف منتج.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "اسم المنتج أو جزء منه (يدعم البحث الجزئي)" },
        limit: { type: "integer", description: "عدد النتائج (افتراضي 10)", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "add_codes_to_product",
    description: "أضف مجموعة أكواد رقمية لمنتج محدد. يستخدم لإضافة أكواد للمنتجات الرقمية مثل اشتراكات أو مفاتيح تفعيل. كل كود يُحفظ في خانة منفصلة.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "integer", description: "معرّف المنتج (احصل عليه من find_products)" },
        codes: {
          type: "array",
          items: { type: "string" },
          description: "قائمة الأكواد، كل عنصر كود واحد",
        },
      },
      required: ["product_id", "codes"],
    },
  },
  {
    name: "list_orders",
    description: "اجلب قائمة الطلبات. استخدمها لعرض الطلبات المعلقة أو حسب أي حالة. الحالات: pending, processing, completed, cancelled. حالة الدفع: unpaid, paid, refunded.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "حالة الطلب (اختياري). مثل pending أو processing" },
        payment_status: { type: "string", description: "حالة الدفع (اختياري). مثل unpaid أو paid" },
        limit: { type: "integer", description: "عدد الطلبات (افتراضي 20)", default: 20 },
      },
    },
  },
  {
    name: "get_order_details",
    description: "اجلب تفاصيل طلب واحد بمعرّفه (المنتجات، السعر، العميل، طريقة الدفع، الإيصال إن وجد).",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "integer", description: "معرّف الطلب" },
      },
      required: ["order_id"],
    },
  },
  {
    name: "get_product_codes_summary",
    description: "اعرف كم كود رقمي متاح وكم مستخدم لمنتج معين. مفيد للتحقق من المخزون.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "integer", description: "معرّف المنتج" },
      },
      required: ["product_id"],
    },
  },
];

// --- Tool executors. Each returns a JSON-serializable result that becomes the
// `tool_result` payload sent back to Claude on the next turn.
async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "find_products") {
    const q = String(input["query"] || "").trim();
    const limit = Math.min(Number(input["limit"]) || 10, 50);
    if (!q) return { error: "أدخل اسم بحث" };
    const rows = await db
      .select({ id: productsTable.id, name: productsTable.name, type: productsTable.type, price: productsTable.price })
      .from(productsTable)
      .where(or(ilike(productsTable.name, `%${q}%`), ilike(productsTable.description, `%${q}%`)))
      .limit(limit);
    return { count: rows.length, products: rows };
  }

  if (name === "add_codes_to_product") {
    const productId = Number(input["product_id"]);
    const rawCodes = Array.isArray(input["codes"]) ? (input["codes"] as unknown[]) : [];
    if (!productId) return { error: "product_id مطلوب" };
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product) return { error: "المنتج غير موجود" };
    if (product.type !== "digital") return { error: `المنتج "${product.name}" ليس منتجاً رقمياً، لا يمكن إضافة أكواد له` };
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const c of rawCodes) {
      const s = String(c).trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      cleaned.push(s);
    }
    if (cleaned.length === 0) return { added: 0, message: "لا توجد أكواد صالحة للإضافة" };
    const inserted = await db
      .insert(digitalCodesTable)
      .values(cleaned.map(code => ({ productId, code })))
      .returning({ id: digitalCodesTable.id });
    return {
      added: inserted.length,
      product_name: product.name,
      message: `تم إضافة ${inserted.length} كود للمنتج "${product.name}"`,
    };
  }

  if (name === "list_orders") {
    const status = input["status"] ? String(input["status"]) : null;
    const payStatus = input["payment_status"] ? String(input["payment_status"]) : null;
    const limit = Math.min(Number(input["limit"]) || 20, 100);
    const filters = [] as ReturnType<typeof eq>[];
    if (status) filters.push(eq(ordersTable.status, status));
    if (payStatus) filters.push(eq(ordersTable.paymentStatus, payStatus));
    const rows = await db
      .select({
        id: ordersTable.id,
        customerName: ordersTable.customerName,
        customerPhone: ordersTable.customerPhone,
        totalAmount: ordersTable.totalAmount,
        status: ordersTable.status,
        paymentStatus: ordersTable.paymentStatus,
        paymentMethod: ordersTable.paymentMethod,
        source: ordersTable.source,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit);
    return {
      count: rows.length,
      orders: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  if (name === "get_order_details") {
    const orderId = Number(input["order_id"]);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return { error: "الطلب غير موجود" };
    return { ...order, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
  }

  if (name === "get_product_codes_summary") {
    const productId = Number(input["product_id"]);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product) return { error: "المنتج غير موجود" };
    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        used: sql<number>`count(*) filter (where used = true)::int`,
      })
      .from(digitalCodesTable)
      .where(eq(digitalCodesTable.productId, productId));
    return {
      product_name: product.name,
      total: counts?.total ?? 0,
      used: counts?.used ?? 0,
      available: (counts?.total ?? 0) - (counts?.used ?? 0),
    };
  }

  return { error: `أداة غير معروفة: ${name}` };
}

const ChatBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ).min(1),
});

const SYSTEM_PROMPT = `أنت مساعد ذكي للوحة تحكم متجر "متجري" الإلكتروني. تساعد صاحب المتجر في إدارة منتجاته وطلباته.

قواعد مهمة:
- ردودك دائماً بالعربية، واضحة ومختصرة.
- استخدم الأدوات المتاحة لتنفيذ أوامر المستخدم بدلاً من الاعتذار أو طلب معلومات إضافية.
- عند طلب إضافة أكواد لمنتج باسمه: ابحث عن المنتج أولاً (find_products)، ثم استخدم معرّفه مع add_codes_to_product.
- إذا وجدت أكثر من منتج بنفس الاسم، اعرض القائمة على المستخدم ليختار.
- عند عرض الطلبات، رتّبها كقائمة واضحة مع أهم البيانات: الرقم، العميل، المبلغ، حالة الدفع.
- استخدم العملة "ر.س" بعد المبالغ.
- لا تخترع بيانات. إذا لم تجد شيئاً، قل ذلك صراحة.`;

router.post("/admin/assistant/chat", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let anthropic: import("@anthropic-ai/sdk").default;
  try {
    const mod = await import("@workspace/integrations-anthropic-ai");
    anthropic = mod.anthropic;
  } catch {
    res.status(503).json({ error: "المساعد الذكي غير مفعّل. يرجى إعداد تكامل Anthropic أولاً." });
    return;
  }

  const messages: MessageParam[] = parsed.data.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: string[] = [];

  // Multi-turn loop: keep asking Claude until it stops requesting tool use.
  // Hard cap at 8 iterations to prevent runaway loops.
  for (let i = 0; i < 8; i++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });
    } catch (err) {
      req.log.error({ err }, "anthropic call failed");
      res.status(502).json({ error: "تعذّر الاتصال بالمساعد الذكي" });
      return;
    }

    if (response.stop_reason !== "tool_use") {
      // Final answer — extract text blocks and return.
      const text = response.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();
      res.json({ reply: text || "تم.", toolsUsed });
      return;
    }

    // Execute any tool_use blocks and feed results back as a user turn.
    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    messages.push({ role: "assistant", content: response.content });

    const toolResults = await Promise.all(
      toolUses.map(async tu => {
        toolsUsed.push(tu.name);
        try {
          const result = await executeTool(tu.name, tu.input as Record<string, unknown>);
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          };
        } catch (err) {
          req.log.error({ err, tool: tu.name }, "tool execution failed");
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: JSON.stringify({ error: "فشل تنفيذ الأداة" }),
            is_error: true,
          };
        }
      }),
    );
    messages.push({ role: "user", content: toolResults });
  }

  res.status(500).json({ error: "تجاوز المساعد الحد الأقصى للمحاولات" });
});

export default router;
