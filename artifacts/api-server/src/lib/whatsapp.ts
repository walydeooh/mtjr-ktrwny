import { logger } from "./logger";
import { usePostgresAuthState } from "./whatsapp-auth";

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

let sock: unknown = null;
let qrCodeData: string | null = null;
let connectionStatus: "disconnected" | "qr" | "connecting" | "connected" = "disconnected";
let connectedPhone: string | null = null;
let connectedName: string | null = null;
let messageHandler: MessageHandler | null = null;
let currentAuthAdapter: { clearAll: () => Promise<void> } | null = null;
// Set synchronously at the start of initWhatsapp so two rapid calls can't
// kick off two parallel socket initializations against the same auth state
// (which would cause WhatsApp to disconnect both with a "Conflict" error).
let initInProgress = false;

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
  if (onMessage) messageHandler = onMessage;
  if (sock || initInProgress) {
    logger.info("WhatsApp client already initialized");
    return;
  }
  // Set the flag SYNCHRONOUSLY before any await — otherwise rapid back-to-back
  // calls both pass the guard above and start two sockets against the same
  // auth state, which WhatsApp rejects with a Conflict.
  initInProgress = true;

  logger.info("Initializing WhatsApp client with Baileys");
  connectionStatus = "connecting";

  try {
    const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = await import("@whiskeysockets/baileys");
    const QRCode = await import("qrcode");

    // Persistent Postgres-backed auth state. Survives container restarts so
    // the user only has to scan the QR code once.
    const authAdapter = await usePostgresAuthState();
    const { state, saveCreds } = authAdapter;
    currentAuthAdapter = authAdapter;
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state as unknown as Parameters<typeof makeWASocket>[0]["auth"],
      printQRInTerminal: false,
      logger: logger.child({ module: "baileys" }) as unknown as Parameters<typeof makeWASocket>[0]["logger"],
      browser: ["متجري", "Chrome", "120.0.0"],
      // Keep the socket alive: send a ping every 25s so idle connections
      // don't get dropped by the WhatsApp server or any intermediate proxy.
      keepAliveIntervalMs: 25_000,
      // Wait longer for outgoing message acks before timing out.
      defaultQueryTimeoutMs: 60_000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock = socket;

    // Wrap saveCreds so a transient DB failure surfaces as a logged warning
    // instead of an unhandled promise rejection that could crash the process.
    socket.ev.on("creds.update", () => {
      saveCreds().catch((err) => {
        logger.warn({ err }, "Failed to persist WhatsApp credentials");
      });
    });

    socket.ev.on("connection.update", async (update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string }) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeData = await QRCode.default.toDataURL(qr);
          connectionStatus = "qr";
          logger.info("QR code generated");
        } catch (e) {
          logger.error({ err: e }, "Failed to generate QR image");
        }
      }

      if (connection === "close") {
        const boom = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
        const statusCode = boom?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.info({ statusCode }, "WhatsApp connection closed");
        connectionStatus = "disconnected";
        connectedPhone = null;
        connectedName = null;
        qrCodeData = null;
        sock = null;

        // If WhatsApp told us to log out, the saved credentials are dead —
        // wipe them so the next init shows a fresh QR code instead of looping
        // through the same broken session forever.
        if (!shouldReconnect && currentAuthAdapter) {
          try {
            await currentAuthAdapter.clearAll();
          } catch (e) {
            logger.warn({ err: e }, "Failed to clear WhatsApp auth state");
          }
          currentAuthAdapter = null;
        }

        if (shouldReconnect) {
          logger.info("Reconnecting WhatsApp...");
          setTimeout(() => {
            initWhatsapp(messageHandler ?? undefined).catch(e => logger.warn({ err: e }, "Reconnect failed"));
          }, 3000);
        }
      } else if (connection === "open") {
        connectionStatus = "connected";
        qrCodeData = null;
        try {
          const user = socket.user;
          connectedPhone = user?.id?.split(":")[0] || null;
          connectedName = user?.name || null;
          logger.info({ phone: connectedPhone, name: connectedName }, "WhatsApp connected");
        } catch (e) {
          logger.warn("Could not get user info");
        }
      }
    });

    socket.ev.on("messages.upsert", async ({ messages: msgs }: { messages: Array<{ key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null }; message?: unknown; messageTimestamp?: number | Long | null }> }) => {
      for (const msg of msgs) {
        if (!msg.message || msg.key.fromMe) continue;

        const from = msg.key.remoteJid || "";
        if (!from || from.includes("@g.us")) continue;

        let body = "";
        const m = msg.message as Record<string, unknown>;
        if (m.conversation) body = m.conversation as string;
        else if (m.extendedTextMessage) body = (m.extendedTextMessage as { text: string }).text;

        if (!body) continue;

        const ts = typeof msg.messageTimestamp === "number"
          ? msg.messageTimestamp
          : (msg.messageTimestamp as { toNumber?: () => number })?.toNumber?.() || Date.now() / 1000;

        if (messageHandler) {
          messageHandler({
            from,
            body,
            id: msg.key.id || `${Date.now()}`,
            timestamp: ts,
            type: "chat",
          });
        }
      }
    });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "WhatsApp initialization failed");
    connectionStatus = "disconnected";
    sock = null;
  } finally {
    initInProgress = false;
  }
}

export async function disconnectWhatsapp() {
  if (sock) {
    try {
      await (sock as { logout(): Promise<void> }).logout();
    } catch (e) {
      try {
        (sock as { end(err?: unknown): void }).end(undefined);
      } catch {}
    }
    sock = null;
  }
  connectionStatus = "disconnected";
  qrCodeData = null;
  connectedPhone = null;
  connectedName = null;
}

export async function sendWhatsappMessage(phone: string, message: string) {
  if (!sock || connectionStatus !== "connected") {
    throw new Error("WhatsApp غير متصل");
  }
  const jid = phone.includes("@") ? phone : `${phone.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  await (sock as { sendMessage(jid: string, content: { text: string }): Promise<void> }).sendMessage(jid, { text: message });
}
