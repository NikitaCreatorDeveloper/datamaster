import { scrubResponse, secretKey } from "./studio/privacy";
import Papa from "papaparse";
import { fromJSON, matrix, type Grid, type Format } from "./core";
export const MAX_BYTES = 16 * 1024 * 1024;
type Imported = Grid & { name: string; format: Format };
export async function parseFile(f: File): Promise<Imported[]> {
  if (f.size > MAX_BYTES) throw Error("size");
  const ext = f.name.split(".").pop()?.toLowerCase(),
    name = f.name.replace(/\.[^.]+$/, "");
  if (ext === "json")
    return [
      {
        ...fromJSON(JSON.parse((await f.text()).replace(/^\uFEFF/, ""))),
        name,
        format: "JSON",
      },
    ];
  if (ext === "csv") {
    const p = Papa.parse<string[]>((await f.text()).replace(/^\uFEFF/, ""), {
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
    });
    if (p.errors.some((e) => e.code !== "UndetectableDelimiter"))
      throw Error("csv");
    return [{ ...matrix(p.data), name, format: "CSV" }];
  }
  if (ext !== "xlsx") throw Error("format");
  return (await import("./studio/excel")).readBook(f, name);
}
export async function encode(
  g: Grid,
  format: Exclude<Format, "API">,
): Promise<Blob> {
  if (format === "JSON")
    return new Blob(
      [
        JSON.stringify(
          g.rows.map((r) =>
            Object.fromEntries(g.cols.map((k, i) => [k, r[i] ?? null])),
          ),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
  if (format === "CSV")
    return new Blob(
      [
        "\uFEFF" +
          Papa.unparse([g.cols, ...g.rows], {
            escapeFormulae: /^[\s]*[=+\-@\t\r]/,
          }),
      ],
      { type: "text/csv;charset=utf-8" },
    );
  return (await import("./studio/excel")).encodeBook([g]);
}
export async function downloadGrid(
  g: Grid,
  name: string,
  format: Exclude<Format, "API">,
) {
  const blob = await encode(g, format),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download =
    (name.replace(/[\\/:*?"<>|]/g, "_") || "Data") + "." + format.toLowerCase();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function fetchGrid(
  input: string,
  path: string,
  token: string,
  signal: AbortSignal,
): Promise<Grid> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw Error("url");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("url");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal,
      headers: token
        ? { Accept: "application/json", Authorization: "Bearer " + token }
        : { Accept: "application/json" },
    });
  } catch (e) {
    if (signal.aborted) throw Error("abort");
    throw Error("cors");
  }
  if (!res.ok) throw Error("HTTP " + res.status);
  if (Number(res.headers.get("Content-Length")) > MAX_BYTES) {
    await res.body?.cancel();
    throw Error("size");
  }
  const reader = res.body?.getReader();
  if (!reader) throw Error("empty");
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw Error("size");
    }
    parts.push(new Uint8Array(value));
  }
  let obj = JSON.parse(await new Blob(parts).text());
  for (const k of path.trim().split(".").filter(Boolean))
    obj = obj && Object.hasOwn(obj, k) ? obj[k] : undefined;
  return fromJSON(
    scrubResponse(
      obj,
      [
        token,
        ...Array.from(url.searchParams)
          .filter(([key]) => secretKey.test(key))
          .map(([, v]) => v),
      ].filter(Boolean),
    ),
  );
}
