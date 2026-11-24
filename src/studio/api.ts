import { secretKey, scrubResponse } from "./privacy";
import { fromJSON, type Grid, LIMIT_ROWS } from "../core";
import { MAX_BYTES } from "../io";
export const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof methods)[number];
export type RequestSpec = {
  method: Method;
  url: string;
  params: string;
  headers: string;
  body: string;
  auth: "none" | "bearer" | "basic" | "key";
  token: string;
  user: string;
  keyName: string;
  path: string;
  paging: "none" | "page" | "cursor";
  pageParam: string;
  cursorPath: string;
  maxPages: number;
};
export const emptyRequest = (): RequestSpec => ({
  method: "GET",
  url: "",
  params: "{}",
  headers: "{}",
  body: "{}",
  auth: "none",
  token: "",
  user: "",
  keyName: "X-API-Key",
  path: "",
  paging: "none",
  pageParam: "page",
  cursorPath: "meta.next",
  maxPages: 5,
});
export type ApiReply = {
  status: number;
  ms: number;
  bytes: number;
  pages: number;
  json: unknown;
  grid: Grid | null;
  truncated: boolean;
  dataError?: string;
};
function dictionary(s: string): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(s.trim() || "{}");
  } catch {
    throw Error("jsonFields");
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.values(value).some((v) => typeof v !== "string")
  )
    throw Error("jsonFields");
  return value as Record<string, string>;
}
export function apiURL(s: string) {
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw Error("url");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        typeof window !== "undefined" &&
        url.origin === window.location.origin &&
        url.protocol === "http:"
      )) ||
    url.username ||
    url.password
  )
    throw Error("url");
  return url;
}
const atPath = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (obj, k) =>
        obj && typeof obj === "object" && Object.hasOwn(obj, k)
          ? (obj as Record<string, unknown>)[k]
          : undefined,
      value,
    );
export function flattenRecords(value: unknown, secrets: string[] = []): Grid {
  const data = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [value]
      : [];
  if (data.length > LIMIT_ROWS) throw Error("limits");
  const rows = data.map((obj) => {
    const row: Record<string, unknown> = Object.create(null);
    function visit(v: unknown, prefix: string, depth: number) {
      if (depth > 15) throw Error("jsonDepth");
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v)) {
          if (
            secretKey.test(k) ||
            secrets.some((secret) => secret && k.includes(secret))
          )
            continue;
          visit(
            x,
            prefix
              ? prefix + "." + k.replaceAll("\\", "\\\\").replaceAll(".", "\\.")
              : k.replaceAll("\\", "\\\\").replaceAll(".", "\\."),
            depth + 1,
          );
        }
      } else row[prefix || "value"] = scrubResponse(v, secrets, depth);
    }
    visit(obj, "", 0);
    return row;
  });
  return fromJSON(rows);
}
function printable(s: string) {
  return typeof s === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(s);
}
export type RequestTemplate = {
  id: string;
  name: string;
  method: Method;
  origin: string;
  route: string;
  headers: string[];
  params: string[];
  auth: RequestSpec["auth"];
  paging: RequestSpec["paging"];
};
export function sanitizeRequest(s: RequestSpec, name: string): RequestTemplate {
  const u = apiURL(s.url),
    safeSegment =
      /^(api|rest|v\d{1,2}|data|orders|items|inventory|products|stocks?|reports|sales|contacts|customers|users|leads|entries|records|list|crm|samples|shipments\.json)$/i;
  const route = u.pathname
    .split("/")
    .map((segment) =>
      !segment || safeSegment.test(segment) ? segment : "{id}",
    )
    .join("/");
  return {
    id: crypto.randomUUID(),
    name,
    method: s.method,
    origin: u.origin,
    route,
    auth: s.auth,
    paging: s.paging,
    headers: Object.keys(dictionary(s.headers)).filter(printable),
    params: [
      ...new Set([
        ...u.searchParams.keys(),
        ...Object.keys(dictionary(s.params)),
      ]),
    ].filter(printable),
  };
}
export function loadTemplate(t: RequestTemplate): RequestSpec {
  const blank = (keys: string[]) =>
    JSON.stringify(Object.fromEntries(keys.map((k) => [k, ""])), null, 2);
  return {
    ...emptyRequest(),
    method: t.method,
    url: t.origin + t.route,
    params: blank(t.params),
    headers: blank(t.headers),
    auth: t.auth,
    paging: t.paging,
  };
}
export async function requestData(
  s: RequestSpec,
  signal: AbortSignal,
): Promise<ApiReply> {
  if (!methods.includes(s.method)) throw Error("method");
  const url = apiURL(s.url);
  if (url.pathname.includes("%7Bid%7D") || url.pathname.includes("{id}"))
    throw Error("url");
  Object.entries(dictionary(s.params)).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  const hdr = dictionary(s.headers),
    headers = new Headers({ Accept: "application/json", ...hdr }),
    opts: RequestInit = {
      method: s.method,
      mode: "cors",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal,
      headers,
    };
  if (s.auth !== "none" && !s.token) throw Error("auth");
  if (s.auth === "bearer") headers.set("Authorization", "Bearer " + s.token);
  if (s.auth === "key") headers.set(s.keyName, s.token);
  if (s.auth === "basic")
    headers.set(
      "Authorization",
      "Basic " +
        btoa(
          Array.from(new TextEncoder().encode(s.user + ":" + s.token), (b) =>
            String.fromCharCode(b),
          ).join(""),
        ),
    );
  if (s.method !== "GET" && s.body.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(s.body);
    } catch {
      throw Error("jsonFields");
    }
    opts.body = JSON.stringify(body);
    if (!headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
  }
  const pages =
      s.method === "GET" && s.paging !== "none"
        ? Math.min(30, Math.max(1, Math.floor(s.maxPages) || 1))
        : 1,
    start = performance.now();
  let total = 0,
    count = 0,
    status = 0,
    last: unknown = null,
    truncated = false,
    cursor = "",
    dataError = "";
  const records: unknown[] = [],
    cursors = new Set<string>();
  for (let i = 0; i < pages; i++) {
    if (s.method === "GET" && s.paging === "page")
      url.searchParams.set(s.pageParam || "page", String(i + 1));
    if (s.method === "GET" && s.paging === "cursor" && cursor)
      url.searchParams.set(s.pageParam || "cursor", cursor);
    let res: Response;
    try {
      res = await fetch(url, opts);
    } catch {
      throw Error(signal.aborted ? "abort" : "cors");
    }
    count++;
    status = res.status;
    if (total + Number(res.headers.get("Content-Length") || 0) > MAX_BYTES) {
      await res.body?.cancel();
      throw Error("size");
    }
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const reader = res.body?.getReader();
    if (reader)
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw Error("size");
        }
        chunks.push(new Uint8Array(value));
      }
    const text = await new Blob(chunks).text();
    try {
      last = text.trim() ? JSON.parse(text) : null;
    } catch {
      last = text.slice(0, 32768);
      dataError = "json";
      break;
    }
    if (!res.ok || last === null) break;
    const values = atPath(last, s.path);
    if (values === undefined) {
      dataError = "json";
      break;
    }
    if (Array.isArray(values)) {
      if (records.length + values.length > LIMIT_ROWS) throw Error("limits");
      for (const row of values) records.push(row);
      if (!values.length) break;
    } else if (values && typeof values === "object") records.push(values);
    else {
      dataError = "json";
      break;
    }
    if (s.paging === "cursor") {
      const next = atPath(last, s.cursorPath);
      if (next == null || next === "") break;
      cursor = String(next);
      if (cursors.has(cursor)) throw Error("paging");
      cursors.add(cursor);
    }
    if (i + 1 === pages && s.paging !== "none" && s.method === "GET")
      truncated = true;
  }
  let grid: Grid | null = null;
  if (status >= 200 && status < 300 && records.length && !dataError) {
    const secrets = [
      s.token,
      headers.get("Authorization") || "",
      (headers.get("Authorization") || "").replace(/^(Bearer|Basic) /i, ""),
      ...Object.entries(hdr)
        .filter(([k]) => secretKey.test(k))
        .map(([, v]) => v),
      ...Array.from(url.searchParams)
        .filter(([k]) => secretKey.test(k))
        .map(([, v]) => v),
    ].filter(Boolean);
    try {
      grid = flattenRecords(records, secrets);
    } catch (e) {
      dataError = e instanceof Error ? e.message : "json";
    }
  }
  return {
    status,
    ms: Math.round(performance.now() - start),
    bytes: total,
    pages: count,
    json: last,
    grid,
    truncated,
    dataError,
  };
}
