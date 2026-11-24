import {
  headers,
  validGrid,
  LIMIT_CELLS,
  LIMIT_COLS,
  LIMIT_ROWS,
  num,
  str,
  type Table,
  type Cell,
} from "../core";
import { address, coords, recalculate, rewriteRefs, colName } from "./formulas";
import type { CellStyle, CellType, SheetMeta } from "./model";
export type Rect = { r: number; c: number; endR: number; endC: number };
export function bounds(s: Rect) {
  return {
    top: Math.min(s.r, s.endR),
    bottom: Math.max(s.r, s.endR),
    left: Math.min(s.c, s.endC),
    right: Math.max(s.c, s.endC),
  };
}
export function blankSheet(name: string, columns = 5, rows = 20): Table {
  return {
    id: crypto.randomUUID(),
    name,
    format: "XLSX",
    updated: Date.now(),
    steps: [],
    cols: Array.from({ length: columns }, (_, i) => colName(i)),
    rows: Array.from({ length: rows }, () => Array<Cell>(columns).fill(null)),
  };
}
export function typedValue(
  input: string,
  type: CellType = "auto",
  previous?: Cell,
): Cell {
  if (!input) return null;
  if (input.length > 32767) throw Error("limits");
  if (type === "text") return input;
  if (type === "date") {
    if (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input) &&
      Number.isFinite(Date.parse(input))
    )
      return input;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
      !Number.isFinite(Date.parse(input)) ||
      new Date(input).toISOString().slice(0, 10) !== input
    )
      throw Error("date");
    return input;
  }
  if (type === "currency" || type === "number" || type === "percent") {
    const n = num(input.replace(/[%₽$€]/g, ""));
    if (!Number.isFinite(n)) throw Error("number");
    return type === "percent" && input.includes("%") ? n / 100 : n;
  }
  if (typeof previous === "boolean" && /^(true|false)$/i.test(input))
    return input.toLowerCase() === "true";
  if (
    (typeof previous === "number" || previous == null) &&
    !/^[-+]?0\d/.test(input) &&
    /^[-+]?\d+(?:[.,]\d+)?$/.test(input) &&
    Number.isFinite(num(input))
  )
    return num(input);
  return input;
}
export function formatted(v: Cell, style: CellStyle | undefined, lang: string) {
  if (v == null) return "";
  if (
    style?.type === "date" &&
    typeof v === "string" &&
    Number.isFinite(Date.parse(v))
  )
    return new Intl.DateTimeFormat(lang, { timeZone: "UTC" }).format(
      new Date(v),
    );
  if (typeof v === "number" && style?.type === "currency")
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 2,
    }).format(v);
  if (typeof v === "number" && style?.type === "percent")
    return new Intl.NumberFormat(lang, {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(v);
  return str(v);
}
export function editCells(
  a: Table,
  edits: { r: number; c: number; value: string }[],
): Table {
  if (!edits.length) return a;
  const rows = a.rows.slice(),
    changed = new Set<number>(),
    cols = a.cols.slice(),
    formulas = { ...a.meta?.formulas };
  let height = rows.length,
    width = cols.length;
  for (const e of edits) {
    if (e.c < 0 || e.r < 0 || !Number.isInteger(e.r) || !Number.isInteger(e.c))
      throw Error("limits");
    width = Math.max(width, e.c + 1);
    height = Math.max(height, e.r + 1);
  }
  if (
    height > LIMIT_ROWS ||
    width > LIMIT_COLS ||
    width * height > LIMIT_CELLS ||
    edits.length > LIMIT_CELLS
  )
    throw Error("limits");
  while (cols.length < width) cols.push(colName(cols.length));
  while (rows.length < height) rows.push(Array(width).fill(null));
  for (const { r, c, value } of edits) {
    if (!changed.has(r)) {
      rows[r] = rows[r].slice();
      changed.add(r);
    }
    const key = address(r, c),
      type = a.meta?.styles?.[key]?.type;
    if (value.startsWith("=") && type !== "text") {
      if (value.length > 4096) throw Error("limits");
      formulas[key] = value;
    } else {
      delete formulas[key];
      rows[r][c] = typedValue(value, type, rows[r][c]);
    }
  }
  if (width > a.cols.length)
    for (let i = 0; i < rows.length; i++) {
      rows[i] = Object.assign(Array(width).fill(null), rows[i]);
    }
  return recalculate({
    ...a,
    steps: [],
    cols: headers(cols),
    rows,
    meta: { ...a.meta, formulas },
  });
}
export function applyStyle(a: Table, selection: Rect, patch: CellStyle): Table {
  const styles = { ...a.meta?.styles },
    rows = a.rows.slice(),
    { top, bottom, left, right } = bounds(selection);
  if ((bottom - top + 1) * (right - left + 1) > 100000)
    throw Error("styleLimit");
  for (let r = top; r <= bottom; r++) {
    if (patch.type) rows[r] = rows[r].slice();
    for (let c = left; c <= right; c++) {
      const key = address(r, c);
      styles[key] = { ...styles[key], ...patch };
      if (patch.type && rows[r][c] != null && !a.meta?.formulas?.[key])
        rows[r][c] = typedValue(str(rows[r][c]), patch.type, rows[r][c]);
    }
  }
  return recalculate({ ...a, rows, meta: { ...a.meta, styles } });
}
export function layout(
  a: Table,
  axis: "row" | "col",
  action: "add" | "remove" | "before" | "after",
  at: number,
): Table {
  const count = axis === "row" ? a.rows.length : a.cols.length;
  if (action === "remove" && axis === "col" && count === 1)
    throw Error("lastColumn");
  const order = Array.from({ length: count }, (_, i) => i);
  if (action === "add") order.splice(at, 0, -1);
  if (action === "remove") order.splice(at, 1);
  if (action === "before" || action === "after") {
    const dest = at + (action === "before" ? -1 : 1);
    if (dest < 0 || dest >= count) return a;
    [order[at], order[dest]] = [order[dest], order[at]];
  }
  const reverse = new Map(order.map((old, now) => [old, now]));
  const translate = (r: number, c: number): [number, number] | null => {
    const index = axis === "row" ? r : c;
    if (index < 0) return [r, c];
    const next =
      index >= count ? index + order.length - count : reverse.get(index);
    return next == null ? null : axis === "row" ? [next, c] : [r, next];
  };
  const meta: SheetMeta = { ...a.meta, styles: {}, formulas: {} };
  for (const [key, style] of Object.entries(a.meta?.styles ?? {})) {
    const pos = translate(...coords(key));
    if (pos) meta.styles![address(...pos)] = style;
  }
  for (const [key, value] of Object.entries(a.meta?.formulas ?? {})) {
    const pos = translate(...coords(key));
    if (pos) meta.formulas![address(...pos)] = rewriteRefs(value, translate);
  }
  const sizeKey = axis === "row" ? "heights" : "widths";
  meta[sizeKey] = Object.fromEntries(
    order
      .map((old, i) => [i, a.meta?.[sizeKey]?.[old]])
      .filter(([, v]) => v != null),
  );
  let cols = a.cols,
    rows = a.rows;
  if (axis === "row")
    rows = order.map((i) => (i < 0 ? Array(cols.length).fill(null) : rows[i]));
  else {
    cols = headers(order.map((i) => (i < 0 ? "Column" : cols[i])));
    rows = rows.map((row) => order.map((i) => (i < 0 ? null : row[i])));
    meta.rules = meta.rules?.filter((rule) => cols.includes(rule.col));
  }
  validGrid({ cols, rows });
  return recalculate({ ...a, steps: [], cols, rows, meta });
}
export function fillRange(a: Table, source: Rect, destination: Rect): Table {
  const src = bounds(source),
    out = bounds(destination),
    h = src.bottom - src.top + 1,
    w = src.right - src.left + 1,
    edits = [];
  if ((out.bottom - out.top + 1) * (out.right - out.left + 1) > 100000)
    throw Error("styleLimit");
  const styles = { ...a.meta?.styles };
  for (let r = out.top; r <= out.bottom; r++)
    for (let c = out.left; c <= out.right; c++) {
      if (r >= src.top && r <= src.bottom && c >= src.left && c <= src.right)
        continue;
      const rr = src.top + ((((r - src.top) % h) + h) % h),
        cc = src.left + ((((c - src.left) % w) + w) % w),
        key = address(rr, cc),
        formula = a.meta?.formulas?.[key];
      let value = str(a.rows[rr]?.[cc]);
      const last = a.rows[src.bottom]?.[cc],
        first = a.rows[src.top]?.[cc];
      if (formula)
        value = rewriteRefs(formula, (y, x, absY, absX) => [
          absY ? y : y + r - rr,
          absX ? x : x + c - cc,
        ]);
      else if (
        h > 1 &&
        w === 1 &&
        typeof last === "number" &&
        typeof first === "number"
      )
        value = String(first + ((r - src.top) * (last - first)) / (h - 1));
      else if (w > 1 && h === 1) {
        const l = a.rows[rr][src.left],
          v = a.rows[rr][src.right];
        if (typeof l === "number" && typeof v === "number")
          value = String(l + ((c - src.left) * (v - l)) / (w - 1));
      }
      if (a.meta?.styles?.[key]) styles[address(r, c)] = a.meta.styles[key];
      edits.push({ r, c, value });
    }
  return editCells({ ...a, meta: { ...a.meta, styles } }, edits);
}
export function ruleChecker(a: Table) {
  const rules = (a.meta?.rules ?? []).map((rule) => {
    const idx = a.cols.indexOf(rule.col),
      dups = new Set<string>();
    if (rule.kind === "duplicate") {
      const seen = new Set<string>();
      for (const row of a.rows) {
        const v = str(row[idx]);
        if (v && seen.has(v)) dups.add(v);
        seen.add(v);
      }
    }
    return { rule, idx, dups };
  });
  return (r: number, c: number) => {
    const v = str(a.rows[r]?.[c]);
    return rules.find(
      ({ rule, idx, dups }) =>
        idx === c &&
        (rule.kind === "duplicate"
          ? dups.has(v)
          : rule.kind === "empty"
            ? !v.trim()
            : rule.kind === "equal"
              ? v === rule.value
              : num(v) > num(rule.value)),
    )?.rule.color;
  };
}
export function uniqueSheetName(name: string, used: Set<string>) {
  const clean =
    name
      .replace(/[\\/*?:\[\]]/g, " ")
      .replace(/^'+|'+$/g, "")
      .trim()
      .slice(0, 31) || "Sheet";
  let out = clean,
    i = 2;
  while (used.has(out.toLowerCase()) || out.toLowerCase() === "history") {
    const suffix = " (" + i++ + ")";
    out = clean.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(out.toLowerCase());
  return out;
}
