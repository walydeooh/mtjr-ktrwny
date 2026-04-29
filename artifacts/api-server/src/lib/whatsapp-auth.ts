import { db, whatsappAuthFilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

type AuthStateAdapter = {
  state: {
    creds: unknown;
    keys: {
      get: (type: string, ids: string[]) => Promise<Record<string, unknown>>;
      set: (data: Record<string, Record<string, unknown>>) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
  clearAll: () => Promise<void>;
};

const fixFileName = (file: string): string =>
  file.replace(/\//g, "__").replace(/:/g, "-");

async function readFile(name: string): Promise<unknown | null> {
  const rows = await db
    .select({ data: whatsappAuthFilesTable.data })
    .from(whatsappAuthFilesTable)
    .where(eq(whatsappAuthFilesTable.fileName, name))
    .limit(1);
  return rows[0]?.data ?? null;
}

async function writeFile(name: string, value: unknown): Promise<void> {
  await db
    .insert(whatsappAuthFilesTable)
    .values({ fileName: name, data: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: whatsappAuthFilesTable.fileName,
      set: { data: value as object, updatedAt: new Date() },
    });
}

async function removeFile(name: string): Promise<void> {
  await db.delete(whatsappAuthFilesTable).where(eq(whatsappAuthFilesTable.fileName, name));
}

/**
 * Postgres-backed Baileys auth state. Mirrors the layout of
 * `useMultiFileAuthState` so each credential / key is stored as its own row.
 *
 * Survives container restarts and redeploys, so the user only has to scan the
 * QR code once. NOT safe to run on multiple instances concurrently — only one
 * process should hold the WhatsApp socket at a time.
 */
export async function usePostgresAuthState(): Promise<AuthStateAdapter> {
  const baileys = await import("@whiskeysockets/baileys");
  const { initAuthCreds, BufferJSON, proto } = baileys;

  // Round-trip through BufferJSON so Buffer fields rehydrate correctly.
  const reviveBuffers = <T>(value: unknown): T =>
    JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
  const stripBuffers = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value, BufferJSON.replacer));

  const storedCreds = await readFile("creds.json");
  const creds = storedCreds ? reviveBuffers(storedCreds) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out: Record<string, unknown> = {};
          await Promise.all(
            ids.map(async (id) => {
              const file = fixFileName(`${type}-${id}.json`);
              const raw = await readFile(file);
              let value: unknown = raw ? reviveBuffers(raw) : null;
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(
                  value as Record<string, unknown>,
                );
              }
              out[id] = value;
            }),
          );
          return out;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(data)) {
            const cat = data[category] as Record<string, unknown>;
            for (const id of Object.keys(cat)) {
              const value = cat[id];
              const file = fixFileName(`${category}-${id}.json`);
              if (value) {
                tasks.push(writeFile(file, stripBuffers(value)));
              } else {
                tasks.push(removeFile(file));
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeFile("creds.json", stripBuffers(creds));
    },
    clearAll: async () => {
      await db.execute(sql`TRUNCATE TABLE ${whatsappAuthFilesTable}`);
      logger.info("WhatsApp auth state cleared from database");
    },
  };
}
