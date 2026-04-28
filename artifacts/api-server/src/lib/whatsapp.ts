import { logger } from "./logger";

type WhatsappStatus = {
  connected: boolean;
  phone: string | null;
  name: string | null;
  batteryLevel: number | null;
};

type MessageHandler = (msg: {
  from: string;
  body: string;
  id: string;
  timestamp: number;
  type: string;
}) => void;

let client: unknown = null;
let qrCodeData: string | null = null;
let connectionStatus: "disconnected" | "qr" | "connecting" | "connected" = "disconnected";
let connectedPhone: string | null = null;
let connectedName: string | null = null;
let whatsappAvailable = false;

export function getWhatsappStatus(): WhatsappStatus {
  return {
    connected: connectionStatus === "connected",
    phone: connectedPhone,
    name: connectedName,
    batteryLevel: null,
  };
}

export function getQrCode() {
  return {
    qr: qrCodeData,
    status: connectionStatus,
  };
}

export async function initWhatsapp(onMessage?: MessageHandler) {
  try {
    // Try to dynamically import whatsapp-web.js to check availability
    const { Client, LocalAuth } = await import("whatsapp-web.js");
    whatsappAvailable = true;

    if (client) {
      logger.info("WhatsApp client already initialized");
      return;
    }

    logger.info("Initializing WhatsApp client");
    connectionStatus = "connecting";

    const c = new Client({
      authStrategy: new LocalAuth({ dataPath: "/tmp/whatsapp-auth" }),
      puppeteer: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
        ],
        headless: true,
      },
    });

    c.on("qr", (qr: string) => {
      logger.info("QR code generated");
      qrCodeData = qr;
      connectionStatus = "qr";
    });

    c.on("ready", async () => {
      logger.info("WhatsApp client ready");
      connectionStatus = "connected";
      qrCodeData = null;
      try {
        const info = (c as { info?: { wid?: { user: string }; pushname?: string } }).info;
        connectedPhone = info?.wid?.user || null;
        connectedName = info?.pushname || null;
      } catch (e) {
        logger.warn("Could not get client info");
      }
    });

    c.on("disconnected", (reason: string) => {
      logger.info({ reason }, "WhatsApp disconnected");
      connectionStatus = "disconnected";
      connectedPhone = null;
      connectedName = null;
      qrCodeData = null;
      client = null;
    });

    c.on("auth_failure", (msg: string) => {
      logger.error({ msg }, "WhatsApp auth failure");
      connectionStatus = "disconnected";
      client = null;
    });

    if (onMessage) {
      c.on("message", async (msg: { from: string; body: string; id: { id: string }; timestamp: number; type: string }) => {
        try {
          onMessage({
            from: msg.from,
            body: msg.body,
            id: msg.id.id,
            timestamp: msg.timestamp,
            type: msg.type,
          });
        } catch (e) {
          logger.error({ err: e }, "Error handling WhatsApp message");
        }
      });
    }

    client = c;
    await c.initialize();
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "WhatsApp not available, running without WhatsApp support");
    connectionStatus = "disconnected";
    whatsappAvailable = false;
    client = null;
  }
}

export async function disconnectWhatsapp() {
  if (client) {
    try {
      await (client as { destroy(): Promise<void> }).destroy();
    } catch (e) {
      logger.warn({ err: e }, "Error destroying WhatsApp client");
    }
    client = null;
  }
  connectionStatus = "disconnected";
  qrCodeData = null;
  connectedPhone = null;
  connectedName = null;
}

export async function sendWhatsappMessage(phone: string, message: string) {
  if (!client || connectionStatus !== "connected") {
    throw new Error("WhatsApp is not connected");
  }
  const chatId = phone.includes("@c.us") ? phone : `${phone.replace(/[^0-9]/g, "")}@c.us`;
  await (client as { sendMessage(id: string, msg: string): Promise<void> }).sendMessage(chatId, message);
}
