#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const destination = process.argv[2];
if (!destination || destination.startsWith("-")) {
  console.error("Usage: npm create livepeer-enterprise <directory>");
  process.exit(1);
}

const target = path.resolve(destination);
try {
  await access(target);
  console.error(`${target} already exists`);
  process.exit(1);
} catch {
  // The directory is free.
}

const here = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.resolve(here, "../..");
const explicit = process.env.LIVEPEER_ENTERPRISE_EXAMPLE?.trim();

if (explicit && !explicit.startsWith("http")) {
  await copyTemplate(path.resolve(explicit), target);
} else if (!explicit && (await isTemplate(checkout))) {
  await copyTemplate(checkout, target);
} else {
  const example = explicit || "https://github.com/livepeer/enterprise-ui";
  const created = spawnSync(
    "npx",
    ["--yes", "create-next-app@latest", target, "--example", example, "--use-npm", "--disable-git", "--yes"],
    { stdio: "inherit" },
  );
  if (created.status !== 0) process.exit(created.status ?? 1);
}

const engineUrl = await ask("LPB_ENGINE_URL", "Engine URL: ");
const adminToken = await ask("LPB_ADMIN_TOKEN", "Engine admin token (lpk_): ");
const sessionSecret = (await ask("SESSION_SECRET", "Session secret (blank generates one): ", "")).trim() || randomBytes(32).toString("base64url");
const invite = await ask("SIGNUP_INVITE_CODE", "Signup invite code (blank disables signup): ", "");

const env = [
  `LPB_ENGINE_URL=${engineUrl}`,
  `LPB_ADMIN_TOKEN=${adminToken}`,
  "LPB_APPLICATION_ID=default",
  `SESSION_SECRET=${sessionSecret}`,
  `SIGNUP_INVITE_CODE=${invite}`,
  "",
].join("\n");

await writeFile(path.join(target, ".env.local"), env, { mode: 0o600 });
console.log(`\nWrote ${path.join(target, ".env.local")}`);
console.log(`cd ${target}`);
console.log("npm install");
console.log("npm run dev");

async function isTemplate(directory) {
  try {
    const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    return pkg.name === "enterprise-ui";
  } catch {
    return false;
  }
}

async function copyTemplate(source, dest) {
  await cp(source, dest, {
    recursive: true,
    filter: (item) => {
      const relative = path.relative(source, item);
      if (!relative) return true;
      const blocked = ["node_modules", ".next", "data", ".git", "coverage", ".env", ".env.local"];
      return !blocked.some((name) => relative === name || relative.startsWith(`${name}${path.sep}`));
    },
  });
}

async function ask(name, prompt, fallback = undefined) {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  if (fallback !== undefined && !process.stdin.isTTY) return fallback;
  if (!process.stdin.isTTY) {
    console.error(`Set ${name}`);
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(prompt)).trim();
  rl.close();
  return answer || fallback || "";
}
