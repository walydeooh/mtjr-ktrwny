import { logger } from "./logger";

const PAYLINK_BASE = "https://restapi.paylink.sa";

type CachedToken = { token: string; expiresAt: number; apiKey: string };
let cachedToken: CachedToken | null = null;
const TOKEN_TTL_MS = 25 * 60 * 1000;

export type PaylinkCreds = {
  apiKey: string;
  secretKey: string;
};

export type PaylinkInvoiceRequest = {
  amount: number;
  orderId: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  callBackUrl: string;
  note?: string;
  products?: Array<{ title: string; price: number; qty: number }>;
};

export type PaylinkInvoice = {
  transactionNo: string;
  url: string;
};

export type PaylinkInvoiceStatus = {
  orderStatus: string;
  orderNumber: string;
  amount: number;
};

async function authenticate(creds: PaylinkCreds): Promise<string> {
  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.apiKey === creds.apiKey &&
    cachedToken.expiresAt > now
  ) {
    return cachedToken.token;
  }

  const res = await fetch(`${PAYLINK_BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      apiId: creds.apiKey,
      secretKey: creds.secretKey,
      persistToken: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paylink auth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { id_token?: string; access_token?: string };
  const token = data.id_token || data.access_token;
  if (!token) throw new Error("Paylink auth: no token in response");

  cachedToken = { token, expiresAt: now + TOKEN_TTL_MS, apiKey: creds.apiKey };
  return token;
}

export async function createPaylinkInvoice(
  creds: PaylinkCreds,
  req: PaylinkInvoiceRequest,
): Promise<PaylinkInvoice> {
  const token = await authenticate(creds);

  const body = {
    amount: req.amount,
    callBackUrl: req.callBackUrl,
    clientEmail: req.customerEmail || "customer@example.com",
    clientMobile: req.customerPhone,
    clientName: req.customerName,
    currency: "SAR",
    note: req.note || `طلب رقم ${req.orderId}`,
    orderNumber: String(req.orderId),
    products: req.products || [
      { title: `طلب رقم ${req.orderId}`, price: req.amount, qty: 1 },
    ],
  };

  const res = await fetch(`${PAYLINK_BASE}/api/addInvoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paylink addInvoice failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    url?: string;
    paymentUrl?: string;
    transactionNo?: string;
    gatewayOrderRequestId?: string;
  };
  const url = data.url || data.paymentUrl;
  const transactionNo = data.transactionNo || data.gatewayOrderRequestId;

  if (!url || !transactionNo) {
    throw new Error(`Paylink addInvoice: missing url/transactionNo in response`);
  }

  return { transactionNo, url };
}

export async function getPaylinkInvoice(
  creds: PaylinkCreds,
  transactionNo: string,
): Promise<PaylinkInvoiceStatus | null> {
  try {
    const token = await authenticate(creds);
    const res = await fetch(
      `${PAYLINK_BASE}/api/getInvoice/${encodeURIComponent(transactionNo)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) {
      logger.warn(
        { status: res.status, transactionNo },
        "Paylink getInvoice non-OK",
      );
      return null;
    }
    const data = (await res.json()) as {
      orderStatus?: string;
      orderNumber?: string;
      amount?: number;
    };
    return {
      orderStatus: String(data.orderStatus || ""),
      orderNumber: String(data.orderNumber || ""),
      amount: typeof data.amount === "number" ? data.amount : 0,
    };
  } catch (e) {
    logger.warn({ err: (e as Error).message, transactionNo }, "Paylink getInvoice error");
    return null;
  }
}

export function isPaylinkConfigured(creds: { apiKey?: string | null; secretKey?: string | null }): boolean {
  return !!(creds.apiKey && creds.secretKey);
}
