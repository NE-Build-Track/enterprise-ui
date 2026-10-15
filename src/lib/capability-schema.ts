import { isRecord } from "@/lib/engine/errors";

const MAP_IMAGE = "https://eliteencoder.net/assets/img/map-image.png";
const VIDEO = "https://example.com/video.mp4";
const AUDIO = "https://example.com/audio.wav";
const PROMPT = "A red paper lantern over a quiet canal at dusk";
const SHA256 = /^[0-9a-f]{64}$/;
const FFMPEG_FORMAT = "comfystream.ffmpeg.request.v1";
const FAL_FORMAT = "livepeer.fal.endpoint-schema.v1";

export type SchemaNode = {
  readonly type?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
  readonly items?: SchemaNode;
  readonly minItems?: number;
  readonly enum?: readonly unknown[];
  readonly oneOf?: readonly SchemaNode[];
  readonly default?: unknown;
  readonly minimum?: number;
  readonly minLength?: number;
};

export type Registration = {
  readonly app: string;
  readonly runnerUrl: string;
  readonly schemaUrl: string;
  readonly schemaPath: string;
  readonly schemaSha256: string;
  readonly required: readonly string[];
};

export type FormField =
  | { readonly kind: "text" | "number"; readonly path: string; readonly label: string; readonly value: string; readonly title: string }
  | { readonly kind: "enum"; readonly path: string; readonly label: string; readonly value: string; readonly options: readonly string[]; readonly title: string }
  | { readonly kind: "group"; readonly label: string; readonly fields: readonly FormField[] };

/** `./schema` on a runner app URL, matching the batch client's urljoin rule. */
export function resolveSchemaUrl(runnerUrl: string, schemaUrl: string): string {
  const relative = schemaUrl.trim();
  if (/^https?:\/\//i.test(relative)) return relative;
  const base = `${runnerUrl.replace(/\/$/, "")}/`;
  if (relative === "" || relative === "." || relative === "./") return runnerUrl.replace(/\/$/, "");
  try {
    return new URL(relative, base).href;
  } catch {
    return `${runnerUrl.replace(/\/$/, "")}/${relative.replace(/^\.\//, "")}`;
  }
}

export function schemaJobPath(runnerUrl: string, resolved: string): string {
  try {
    const base = new URL(runnerUrl);
    const target = new URL(resolved);
    if (base.origin !== target.origin) return target.pathname;
    const basePath = base.pathname.replace(/\/$/, "");
    const targetPath = target.pathname.replace(/\/$/, "");
    if (targetPath === basePath) return "";
    if (targetPath.startsWith(`${basePath}/`)) return targetPath.slice(basePath.length);
    return target.pathname.startsWith("/") ? target.pathname : `/${target.pathname}`;
  } catch {
    return "/schema";
  }
}

export function registrationsFromDiscovery(body: unknown): readonly Registration[] {
  if (!Array.isArray(body)) return [];
  const found: Registration[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || !Array.isArray(entry.runners)) continue;
    for (const runner of entry.runners) {
      const registration = registrationFromRunner(runner);
      if (registration) found.push(registration);
    }
  }
  return found;
}

export function requestSchema(document: unknown): { ok: true; schema: SchemaNode } | { ok: false; error: string } {
  if (!isRecord(document) || typeof document.format !== "string") {
    return { ok: false, error: "schema format is missing" };
  }
  if (document.format === FFMPEG_FORMAT) return { ok: true, schema: asSchema(document) };
  if (document.format === FAL_FORMAT) return falRequestSchema(document);
  return { ok: false, error: "schema format is not supported" };
}

export function exampleFromSchema(schema: SchemaNode): Record<string, unknown> | null {
  if (!schema.properties) return null;
  return objectExample(schema, false);
}

export function formFields(schema: SchemaNode, value: unknown): readonly FormField[] {
  return objectFields(schema, value, [], false);
}

export function missingRequired(payload: Record<string, unknown> | null, required: readonly string[]): readonly string[] {
  if (required.length === 0) return [];
  if (!payload) return required;
  return required.filter((key) => {
    if (!Object.hasOwn(payload, key)) return true;
    return Array.isArray(payload[key]) && payload[key].length === 0;
  });
}

export function writePath(source: unknown, path: readonly string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (/^\d+$/.test(head)) {
    const list = Array.isArray(source) ? source.slice() : [];
    list[Number(head)] = writePath(list[Number(head)], rest, value);
    return list;
  }
  const record = isRecord(source) ? { ...source } : {};
  record[head] = writePath(record[head], rest, value);
  return record;
}

/** A pasted media URL picks the compose track type. Other keys stay as typed. */
export function alignMediaType(source: unknown, path: readonly string[]): unknown {
  if (path.at(-1) !== "url") return source;
  const url = readPath(source, path);
  if (typeof url !== "string") return source;
  const kind = mediaKind(url);
  if (!kind) return source;
  for (let end = path.length - 1; end > 0; end -= 1) {
    const parentPath = path.slice(0, end);
    const parent = readPath(source, parentPath);
    if (!isRecord(parent) || (parent.type !== "image" && parent.type !== "video" && parent.type !== "audio")) continue;
    if (parent.type === kind) return source;
    return writePath(source, [...parentPath, "type"], kind);
  }
  return source;
}

export function schemaAt(schema: SchemaNode, path: readonly string[]): SchemaNode | null {
  let current: SchemaNode | null = schema;
  for (const segment of path) {
    if (!current) return null;
    if (/^\d+$/.test(segment)) {
      current = current.items ?? null;
      continue;
    }
    current = propertiesOf(current)?.[segment] ?? null;
  }
  return current;
}

export function coerceField(schema: SchemaNode | null, text: string): unknown {
  if (schema?.type === "integer" || schema?.type === "number") {
    if (text.trim() === "") return schema.default ?? 0;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return schema.default ?? text;
    return schema.type === "integer" ? Math.trunc(parsed) : parsed;
  }
  return text;
}

export function canonicalSchemaJson(text: string): string | null {
  try {
    return JSON.stringify(sortJson(JSON.parse(text) as unknown));
  } catch {
    return null;
  }
}

export function schemaDocumentMatches(text: string, expected: string, digest: (value: string) => string): boolean {
  if (digest(text) === expected) return true;
  const canonical = canonicalSchemaJson(text);
  return canonical !== null && digest(canonical) === expected;
}

function registrationFromRunner(runner: unknown): Registration | null {
  if (!isRecord(runner)) return null;
  const app = text(runner.app);
  const runnerUrl = text(runner.url);
  const metadata = parseMetadata(runner.metadata);
  if (!app || !runnerUrl || !metadata) return null;
  const schemaUrl = text(metadata.schema_url);
  const schemaSha256 = text(metadata.schema_sha256);
  if (!schemaUrl || !schemaSha256 || !SHA256.test(schemaSha256)) return null;
  const resolved = resolveSchemaUrl(runnerUrl, schemaUrl);
  return {
    app,
    runnerUrl,
    schemaUrl: resolved,
    schemaPath: schemaJobPath(runnerUrl, resolved),
    schemaSha256,
    required: stringList(metadata.required),
  };
}

function falRequestSchema(document: Record<string, unknown>): { ok: true; schema: SchemaNode } | { ok: false; error: string } {
  const input = isRecord(document.input_schema) ? document.input_schema.$ref : null;
  if (typeof input !== "string" || !input.startsWith("#/components/schemas/")) {
    return { ok: false, error: "fal schema input_schema ref is missing" };
  }
  const name = input.slice("#/components/schemas/".length);
  const components = isRecord(document.components) ? document.components.schemas : null;
  if (!isRecord(components) || !isRecord(components[name])) {
    return { ok: false, error: `fal schema ${name} is missing` };
  }
  return { ok: true, schema: asSchema(components[name]) };
}

function asSchema(value: Record<string, unknown>): SchemaNode {
  return value as SchemaNode;
}

function objectExample(schema: SchemaNode, nested: boolean): Record<string, unknown> {
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  const body: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(properties)) {
    if (!nested && !required.has(key) && !hasDefault(child)) continue;
    body[key] = exampleValue(child, key);
  }
  const options = properties.type ? stringEnum(properties.type) : [];
  const url = typeof body.url === "string" ? body.url : nestedUrl(body.keyframes);
  const kind = typeof url === "string" ? mediaKind(url) : null;
  if (kind && options.includes(kind)) body.type = kind;
  return body;
}

function exampleValue(schema: SchemaNode, key: string): unknown {
  const preferred = schema.oneOf?.length ? objectBranch(schema) : null;
  if (preferred && preferred !== schema) return exampleValue(preferred, key);
  const branch = schema;
  // Eight frames is two seconds at the default 4 fps, the same span as a 2000ms keyframe.
  if (key === "frames") return 8;
  if (hasDefault(branch)) return branch.default;
  const options = stringEnum(branch);
  if (options.length > 0) return options[0];
  if (branch.items || branch.type === "array") {
    const count = Math.max(branch.minItems ?? 1, 1);
    return Array.from({ length: count }, () => exampleValue(branch.items ?? {}, key));
  }
  if (branch.properties || branch.type === "object") return objectExample(branch, true);
  if (branch.type === "integer" || branch.type === "number") return sampleNumber(branch, key);
  return sampleString(key, branch.minLength);
}

function objectFields(schema: SchemaNode, value: unknown, prefix: readonly string[], nested: boolean): FormField[] {
  const required = new Set(schema.required ?? []);
  const record = isRecord(value) ? value : {};
  const fields: FormField[] = [];
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    if (!nested && !required.has(key) && !hasDefault(child)) continue;
    fields.push(...nodeFields(child, record[key], [...prefix, key], key));
  }
  return fields;
}

function nodeFields(schema: SchemaNode, value: unknown, path: readonly string[], label: string): FormField[] {
  const branch = displayedBranch(schema, value);
  const title = branch.description ?? "";
  const options = stringEnum(branch);
  if (options.length > 0) {
    const selected = typeof value === "string" && options.includes(value) ? value : options[0]!;
    return [{ kind: "enum", path: path.join("."), label, value: selected, options, title }];
  }
  if (branch.items || branch.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const count = Math.max(items.length, branch.minItems ?? 1, 1);
    const children: FormField[] = [];
    for (let index = 0; index < count; index += 1) {
      const itemLabel = `${label} ${index + 1}`;
      children.push(...nodeFields(branch.items ?? {}, items[index], [...path, String(index)], itemLabel));
    }
    return [{ kind: "group", label, fields: children }];
  }
  if (branch.properties || branch.type === "object") {
    return [{ kind: "group", label, fields: objectFields(branch, value, path, true) }];
  }
  const kind = branch.type === "number" || branch.type === "integer" ? "number" : "text";
  return [{ kind, path: path.join("."), label, value: value == null ? "" : String(value), title }];
}

function displayedBranch(schema: SchemaNode, value: unknown): SchemaNode {
  if (!schema.oneOf || schema.oneOf.length === 0) return schema;
  if (typeof value === "string") return schema.oneOf.find((branch) => branch.type === "string") ?? schema.oneOf[0]!;
  return objectBranch(schema) ?? schema.oneOf[0]!;
}

function objectBranch(schema: SchemaNode): SchemaNode | null {
  if (schema.properties || schema.type === "object") return schema;
  return schema.oneOf?.find((branch) => branch.properties || branch.type === "object") ?? null;
}

function propertiesOf(schema: SchemaNode): Readonly<Record<string, SchemaNode>> | undefined {
  return schema.properties ?? objectBranch(schema)?.properties;
}

function sampleNumber(schema: SchemaNode, key: string): number {
  if (key === "duration" && schema.description?.toLowerCase().includes("millisecond")) return 2000;
  if (typeof schema.minimum === "number") return schema.minimum;
  return 0;
}

function sampleString(key: string, minLength: number | undefined): string {
  const name = key.toLowerCase();
  if (name === "prompt") return PROMPT;
  if (name === "id") return "video";
  if (name.includes("audio")) return AUDIO;
  if (name.includes("video") || name === "media_url") return VIDEO;
  if (name === "url" || name.includes("image")) return MAP_IMAGE;
  return minLength ? key : "";
}

function nestedUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = nestedUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (typeof value.url === "string") return value.url;
  for (const child of Object.values(value)) {
    const found = nestedUrl(child);
    if (found) return found;
  }
  return null;
}

function mediaKind(url: string): "image" | "video" | "audio" | null {
  const path = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|gif|webp|bmp|avif)$/.test(path)) return "image";
  if (/\.(mp4|webm|mov|mkv|m4v|m3u8)$/.test(path)) return "video";
  if (/\.(mp3|wav|aac|m4a|ogg|flac)$/.test(path)) return "audio";
  return null;
}

function stringEnum(schema: SchemaNode): readonly string[] {
  if (!schema.enum) return [];
  return schema.enum.filter((item): item is string => typeof item === "string");
}

function hasDefault(schema: SchemaNode): boolean {
  return Object.hasOwn(schema, "default");
}

function readPath(source: unknown, path: readonly string[]): unknown {
  let current = source;
  for (const segment of path) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortJson(value[key]);
  return sorted;
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(value) ? value : null;
}

function stringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
