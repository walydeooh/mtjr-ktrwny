import { Request, Response, NextFunction } from "express";
import { verifyCustomerToken } from "../lib/customer-auth";

export function requireCustomer(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyCustomerToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  (req as Request & { customer: typeof payload }).customer = payload;
  next();
}
