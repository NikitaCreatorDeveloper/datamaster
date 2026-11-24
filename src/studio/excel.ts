import type ExcelJS from "exceljs";
import {
  headers,
  LIMIT_ROWS,
  LIMIT_CELLS,
  LIMIT_COLS,
  type Grid,
  type Table,
  type Cell,
} from "../core";
import { type SheetMeta, type CellStyle, type Rule } from "./model";
import {
  address,
  coords,
  colName,
  recalculate,
  supportsFormula,
} from "./formulas";
import { uniqueSheetName } from "./sheets";
const formats = {
  text: "@",
  number: "#,##0.00",
  date: "yyyy-mm-dd",
  currency: '#,##0.00 "₽"',
  percent: "0.00%",
  auto: "General",
};
const rgb = (hex: string) => "FF" + hex.slice(1).toUpperCase();
function styleOf(c: ExcelJS.Cell): CellStyle | undefined {
  const fmt = c.numFmt || "",
    s: CellStyle = {};
  if (c.font?.bold) s.bold = true;
  if (c.font?.italic) s.italic = true;
  if (c.font?.name) s.font = c.font.name;
  if (c.font?.color?.argb) s.color = "#" + c.font.color.argb.slice(-6);
  if (
    c.fill?.type === "pattern" &&
    c.fill.pattern === "solid" &&
    c.fill.fgColor?.argb
  )
    s.fill = "#" + c.fill.fgColor.argb.slice(-6);
  if (c.border && Object.values(c.border).some((b) => b?.style))
    s.border = true;
  if (["left", "right", "center"].includes(c.alignment?.horizontal || ""))
    s.align = c.alignment.horizontal as CellStyle["align"];
  if (fmt.includes("%")) s.type = "percent";
  else if (/[₽€$£]/.test(fmt)) s.type = "currency";
  else if (/[yd]/i.test(fmt)) s.type = "date";
  else if (fmt === "@") s.type = "text";
  else if (/[0#]/.test(fmt)) s.type = "number";
  return Object.keys(s).length ? s : undefined;
}
// Read the central directory before the XLSX library inflates XML into memory.
function checkArchive(bytes: ArrayBuffer) {
  const v = new DataView(bytes);
  let end = v.byteLength - 22;
  for (; end >= Math.max(0, v.byteLength - 65557); end--)
    if (v.getUint32(end, true) === 0x06054b50) break;
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50) throw Error("format");
  const count = v.getUint16(end + 10, true);
  let pos = v.getUint32(end + 16, true),
    total = 0;
  if (count > 12000) throw Error("limits");
  for (let i = 0; i < count; i++) {
    if (pos + 46 > v.byteLength || v.getUint32(pos, true) !== 0x02014b50)
      throw Error("format");
    total += v.getUint32(pos + 24, true);
    if (total > 96 * 1024 * 1024) throw Error("limits");
    pos +=
      46 +
      v.getUint16(pos + 28, true) +
      v.getUint16(pos + 30, true) +
      v.getUint16(pos + 32, true);
  }
}
// Only recognize whole-column rules that the editor can reproduce exactly.
function readRules(
  sh: ExcelJS.Worksheet,
  cols: string[],
  height: number,
): Rule[] {
  const formats =
    (
      sh as ExcelJS.Worksheet & {
        conditionalFormattings?: ExcelJS.ConditionalFormattingOptions[];
      }
    ).conditionalFormattings ?? [];
  const result: Rule[] = [];
  for (const format of formats) {
    const range = /^([A-Z]+)2:([A-Z]+)([0-9]+)$/.exec(format.ref);
    if (!range || range[1] !== range[2] || Number(range[3]) !== height + 1)
      continue;
    const col = cols[coords(range[1] + "2")[1]],
      cell = range[1] + "2";
    if (!col) continue;
    const dup =
      "AND(" +
      cell +
      '<>"",COUNTIF(' +
      range[1] +
      "$2:" +
      range[1] +
      "$" +
      (height + 1) +
      "," +
      cell +
      ")>1)";
    for (const r of format.rules) {
      const fill = r.style?.fill;
      if (
        r.type !== "expression" ||
        fill?.type !== "pattern" ||
        result.length >= 100
      )
        continue;
      const rgb = fill.bgColor?.argb ?? fill.fgColor?.argb;
      if (!rgb || !/^[0-9a-f]{6,8}$/i.test(rgb)) continue;
      const color = "#" + rgb.slice(-6).toLowerCase(),
        expression = String(r.formulae?.[0] ?? "");
      if (expression === dup)
        result.push({ col, kind: "duplicate", value: "", color });
      else if (expression === cell + '=""')
        result.push({ col, kind: "empty", value: "", color });
      else if (expression.startsWith(cell + '="') && expression.endsWith('"'))
        result.push({
          col,
          kind: "equal",
          value: expression.slice(cell.length + 2, -1).replaceAll('""', '"'),
          color,
        });
      else if (
        expression.startsWith(cell + ">") &&
        Number.isFinite(Number(expression.slice(cell.length + 1)))
      )
        result.push({
          col,
          kind: "greater",
          value: expression.slice(cell.length + 1),
          color,
        });
    }
  }
  return result;
}
export async function readBook(f: File, name: string) {
  const bytes = await f.arrayBuffer();
  checkArchive(bytes);
  const {
      default: { Workbook },
    } = await import("exceljs"),
    book = new Workbook();
  await book.xlsx.load(bytes);
  const sheets: Table[] = [];
  let used = 0;
  for (const sh of book.worksheets) {
    if (!sh.actualRowCount) continue;
    const width = sh.columnCount,
      height = sh.rowCount - 1;
    used += width * (height + 1);
    if (
      width > LIMIT_COLS ||
      height > LIMIT_ROWS ||
      width * height > LIMIT_CELLS ||
      used > 3_000_000
    )
      throw Error("limits");
    const meta: SheetMeta = {
        tabName: sh.name,
        styles: {},
        formulas: {},
        heights: {},
        widths: {},
      },
      cols = headers(
        Array.from({ length: width }, (_, i) => sh.getCell(1, i + 1).text),
      );
    for (let c = 0; c < width; c++) {
      const w = sh.getColumn(c + 1).width;
      if (w)
        meta.widths![c] = Math.min(520, Math.max(55, Math.round(w * 7 + 5)));
    }
    const view = sh.views?.find((v) => v.state === "frozen");
    if (view?.state === "frozen") {
      meta.frozenRows = Math.min(100, Math.max(0, (view.ySplit ?? 1) - 1));
      meta.frozenCols = Math.min(50, view.xSplit || 0);
    }
    const rows: Cell[][] = Array.from({ length: height }, () =>
      Array(width).fill(null),
    );
    meta.rules = readRules(sh, cols, height);
    sh.eachRow({ includeEmpty: true }, (row, n) => {
      if (n === 1) return;
      if (row.height)
        meta.heights![n - 2] = Math.min(
          250,
          Math.max(8, Math.round((row.height * 4) / 3)),
        );
      row.eachCell({ includeEmpty: true }, (c, i) => {
        if (i > width) return;
        const key = address(n - 2, i - 1);
        let value = c.value;
        if (
          value &&
          typeof value === "object" &&
          ("formula" in value || "sharedFormula" in value)
        ) {
          const formula = c.formula;
          if (formula && supportsFormula(formula))
            meta.formulas![key] =
              "=" + formula.replace(/_xlfn\.XLOOKUP/gi, "XLOOKUP");
          value = c.result ?? null;
        }
        rows[n - 2][i - 1] =
          value instanceof Date
            ? value.toISOString()
            : value !== null && typeof value === "object"
              ? c.text
              : (value ?? null);
        const style = styleOf(c);
        if (style) meta.styles![key] = style;
      });
    });
    sheets.push(
      recalculate({
        id: crypto.randomUUID(),
        name: book.worksheets.length > 1 ? name + " · " + sh.name : name,
        format: "XLSX",
        updated: 0,
        steps: [],
        cols,
        rows,
        meta,
      }),
    );
  }
  if (!sheets.length) throw Error("empty");
  return sheets;
}
export async function encodeBook(
  tables: (Grid & { meta?: SheetMeta; name?: string })[],
): Promise<Blob> {
  const {
      default: { Workbook },
    } = await import("exceljs"),
    book = new Workbook(),
    used = new Set<string>();
  for (const a of tables) {
    const sh = book.addWorksheet(
        uniqueSheetName(a.meta?.tabName || a.name || "Data", used),
      ),
      meta = a.meta ?? {};
    sh.addRow(a.cols);
    sh.addRows(a.rows);
    if (a.rows.length && a.rows.at(-1)!.every((v) => v == null))
      sh.getRow(a.rows.length + 1).height = 25.5;
    sh.getRow(1).font = { bold: true };
    sh.columns.forEach(
      (col, c) =>
        (col.width = meta.widths?.[c]
          ? Math.max(1, (meta.widths[c] - 5) / 7)
          : 22),
    );
    sh.views = [
      {
        state: "frozen",
        xSplit: meta.frozenCols ?? 0,
        ySplit: (meta.frozenRows ?? 0) + 1,
      },
    ];
    for (const [r, h] of Object.entries(meta.heights ?? {}))
      sh.getRow(Number(r) + 2).height = (h * 3) / 4;
    for (const [ref, s] of Object.entries(meta.styles ?? {})) {
      const c = sh.getCell(ref);
      c.font = {
        bold: s.bold,
        italic: s.italic,
        name: s.font,
        ...(s.color ? { color: { argb: rgb(s.color) } } : {}),
      };
      if (s.fill)
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: rgb(s.fill) },
        };
      if (s.align) c.alignment = { horizontal: s.align };
      if (s.border) {
        const edge = { style: "thin" as const, color: { argb: "FF989BAD" } };
        c.border = { left: edge, right: edge, top: edge, bottom: edge };
      }
      if (s.type) c.numFmt = formats[s.type];
      if (
        s.type === "date" &&
        typeof c.value === "string" &&
        Number.isFinite(Date.parse(c.value))
      )
        c.value = new Date(c.value);
    }
    for (const [key, f] of Object.entries(meta.formulas ?? {})) {
      if (!supportsFormula(f)) continue;
      const [r, c] = coords(key),
        v = a.rows[r]?.[c];
      const result =
        typeof v === "string" &&
        /^#(REF!|NUM!|VALUE!|DIV\/0!|N\/A|NAME\?|CYCLE!|LIMIT!|PARSE!)$/.test(v)
          ? {
              error: (v === "#CYCLE!" || v === "#LIMIT!" || v === "#PARSE!"
                ? "#VALUE!"
                : v) as ExcelJS.CellErrorValue["error"],
            }
          : (v ?? undefined);
      const formula = f
        .slice(1)
        .replace(/"(?:[^"]|"")*"|;|\bXLOOKUP(?=\s*\()/gi, (m) =>
          m === ";" ? "," : m.toUpperCase() === "XLOOKUP" ? "_xlfn.XLOOKUP" : m,
        );
      sh.getCell(key).value = { formula, result } as ExcelJS.CellFormulaValue;
    }
    for (const rule of meta.rules ?? []) {
      const idx = a.cols.indexOf(rule.col);
      if (idx < 0 || !a.rows.length) continue;
      const col = colName(idx),
        ref = col + "2:" + col + (a.rows.length + 1),
        literal = '"' + rule.value.replaceAll('"', '""') + '"';
      const expr =
        rule.kind === "duplicate"
          ? "AND(" +
            col +
            '2<>"",COUNTIF(' +
            col +
            "$2:" +
            col +
            "$" +
            (a.rows.length + 1) +
            "," +
            col +
            "2)>1)"
          : rule.kind === "empty"
            ? col + '2=""'
            : rule.kind === "equal"
              ? col + "2=" + literal
              : col + "2>" + Number(rule.value);
      sh.addConditionalFormatting({
        ref,
        rules: [
          {
            type: "expression",
            formulae: [expr],
            priority: 1,
            style: {
              fill: {
                type: "pattern",
                pattern: "solid",
                bgColor: { argb: rgb(rule.color) },
              },
            },
          },
        ],
      });
    }
  }
  return new Blob([new Uint8Array(await book.xlsx.writeBuffer())], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
