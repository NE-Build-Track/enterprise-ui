import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type KeyRecord = {
  readonly keyId: string;
  readonly actorId: string;
  readonly applicationId: string;
  readonly kind: string;
  readonly label: string;
  readonly issuedAt: string;
};

type RegistryFile = Record<string, KeyRecord>;

let chain: Promise<void> = Promise.resolve();

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function registryPath(): string {
  return process.env.LPB_KEY_REGISTRY ?? path.join(process.cwd(), "data", "key-registry.json");
}

export async function rememberKey(token: string, record: KeyRecord): Promise<void> {
  await lock(async () => {
    const all = await readAll();
    all[tokenDigest(token)] = record;
    const file = registryPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ file, JSON.stringify(all, null, 2), { mode: 0o600 });
  });
}

export async function lookupKey(token: string): Promise<KeyRecord | null> {
  const all = await readAll();
  return all[tokenDigest(token)] ?? null;
}

async function readAll(): Promise<RegistryFile> {
  try {
    const text = await readFile(/* turbopackIgnore: true */ registryPath(), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as RegistryFile;
  } catch (error) {
    if (isNotFound(error)) return {};
    throw error;
  }
}

function lock(work: () => Promise<void>): Promise<void> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
