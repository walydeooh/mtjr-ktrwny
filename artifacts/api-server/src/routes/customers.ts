import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, ilike, or } from "drizzle-orm";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  ListCustomersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatCustomer(c: typeof customersTable.$inferSelect) {
  // Strip the bcrypt password hash before returning a customer to any client.
  const { passwordHash: _omit, ...safe } = c;
  return {
    ...safe,
    totalSpent: parseFloat(c.totalSpent as unknown as string),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/customers", async (req, res): Promise<void> => {
  const params = ListCustomersQueryParams.safeParse(req.query);
  let customers;
  if (params.success && params.data.search) {
    const search = `%${params.data.search}%`;
    customers = await db.select().from(customersTable).where(
      or(ilike(customersTable.name, search), ilike(customersTable.phone, search))
    );
  } else {
    customers = await db.select().from(customersTable);
  }
  res.json(customers.map(formatCustomer));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(customersTable).where(eq(customersTable.phone, parsed.data.phone));
  if (existing.length > 0) {
    res.status(201).json(formatCustomer(existing[0]));
    return;
  }

  const [customer] = await db.insert(customersTable).values(parsed.data).returning();
  res.status(201).json(formatCustomer(customer));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) {
    res.status(404).json({ error: "العميل غير موجود" });
    return;
  }
  res.json(formatCustomer(customer));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.update(customersTable).set(parsed.data).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) {
    res.status(404).json({ error: "العميل غير موجود" });
    return;
  }
  res.json(formatCustomer(customer));
});

export default router;
