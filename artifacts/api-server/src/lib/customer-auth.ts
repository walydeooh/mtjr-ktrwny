import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["SESSION_SECRET"] || "default-secret-change-me";

export function signCustomerToken(payload: { id: number; phone: string }): string {
  return jwt.sign({ ...payload, kind: "customer" }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyCustomerToken(token: string): { id: number; phone: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; phone: string; kind?: string };
    if (decoded.kind !== "customer") return null;
    return { id: decoded.id, phone: decoded.phone };
  } catch {
    return null;
  }
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    if (p.startsWith("9665") || p.startsWith("9667")) p = "+" + p;
    else if (p.startsWith("05")) p = "+966" + p.slice(1);
    else if (p.startsWith("5") && p.length === 9) p = "+966" + p;
    else p = "+" + p;
  }
  return p;
}
