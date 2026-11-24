import Papa from "papaparse";
import {
  fromJSON,
  matrix,
  LIMIT_ROWS,
  LIMIT_COLS,
  LIMIT_CELLS,
  type Grid,
  type Cell,
  type Format,
} from "./core";
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
  const {
    default: { Workbook },
  } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(await f.arrayBuffer());
  const out: Imported[] = [];
  for (const sh of wb.worksheets) {
    if (!sh.actualRowCount) continue;
    if (
      sh.rowCount > LIMIT_ROWS + 1 ||
      sh.columnCount > LIMIT_COLS ||
      sh.rowCount * sh.columnCount > LIMIT_CELLS + sh.columnCount
    )
      throw Error("limits");
    const values: Cell[][] = [];
    sh.eachRow((row) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (c, i) => {
        let v = c.value;
        if (
          v &&
          typeof v === "object" &&
          ("formula" in v || "sharedFormula" in v)
        )
          v = v.result ?? null;
        cells[i - 1] =
          v instanceof Date
            ? v.toISOString()
            : v !== null && typeof v === "object"
              ? c.text
              : (v ?? null);
      });
      values.push(cells);
    });
    out.push({
      ...matrix(values),
      name: wb.worksheets.length > 1 ? name + " · " + sh.name : name,
      format: "XLSX",
    });
  }
  if (!out.length) throw Error("empty");
  return out;
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
  const {
    default: { Workbook },
  } = await import("exceljs");
  const wb = new Workbook(),
    sh = wb.addWorksheet("Data");
  sh.addRow(g.cols);
  sh.addRows(g.rows);
  sh.getRow(1).font = { bold: true };
  sh.columns.forEach((c) => {
    c.width = 22;
  });
  sh.views = [{ state: "frozen", ySplit: 1 }];
  return new Blob([new Uint8Array(await wb.xlsx.writeBuffer())], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
  return fromJSON(obj);
}
