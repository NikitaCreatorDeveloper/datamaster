import {
  applyStep,
  str,
  num,
  validGrid,
  headers,
  appendTables,
  LIMIT_CELLS,
  type Cell,
  type Grid,
} from "../core";
import type { Stage, Aggregation } from "./model";
export const bare = (g: Grid): Grid => ({ cols: g.cols, rows: g.rows });
const index = (g: Grid, col: string) => {
  const i = g.cols.indexOf(col);
  if (i < 0) throw Error("column");
  return i;
};
export function normalizeValue(
  v: Cell,
  mode: "text" | "number" | "phone" | "date",
): Cell {
  if (v === null || v === "") return null;
  const text = str(v).normalize("NFKC").trim().replace(/\s+/g, " ");
  if (mode === "text") return text;
  if (mode === "number") {
    const n = num(text.replace(/[₽€$]/g, ""));
    if (!Number.isFinite(n)) throw Error("numericColumn");
    return n;
  }
  if (mode === "phone") {
    let digits = text.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("8"))
      digits = "7" + digits.slice(1);
    else if (digits.length === 10) digits = "7" + digits;
    if (digits.length < 7 || digits.length > 15) throw Error("phone");
    return "+" + digits;
  }
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text),
    date = m
      ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0")
      : text.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("date");
  return date;
}
type Bucket = {
  sum: number;
  count: number;
  numbers: number;
  min: number;
  max: number;
};
const bucket = (): Bucket => ({
  sum: 0,
  count: 0,
  numbers: 0,
  min: Infinity,
  max: -Infinity,
});
function accumulate(b: Bucket, value: Cell) {
  if (str(value).trim()) b.count++;
  const n = num(value);
  if (Number.isFinite(n)) {
    b.sum += n;
    b.numbers++;
    b.min = Math.min(n, b.min);
    b.max = Math.max(n, b.max);
  }
}
function aggValue(b: Bucket | undefined, agg: Aggregation) {
  if (!b) return null;
  if (agg === "count") return b.count;
  if (!b.numbers) return null;
  return agg === "sum"
    ? b.sum
    : agg === "mean"
      ? b.sum / b.numbers
      : agg === "min"
        ? b.min
        : b.max;
}
export function aggregate(
  g: Grid,
  group: string,
  measure: string,
  agg: Aggregation,
  split = "",
): Grid {
  const gi = index(g, group),
    mi = index(g, measure),
    si = split ? index(g, split) : -1,
    groups = new Map<string, { label: Cell; buckets: Map<string, Bucket> }>(),
    series = new Set<string>();
  for (const r of g.rows) {
    const key = JSON.stringify(r[gi]),
      splitKey = si < 0 ? measure : str(r[si]) || "∅";
    series.add(splitKey);
    if (series.size > 200) throw Error("pivotLimit");
    if (!groups.has(key)) groups.set(key, { label: r[gi], buckets: new Map() });
    const items = groups.get(key)!.buckets;
    if (!items.has(splitKey)) items.set(splitKey, bucket());
    accumulate(items.get(splitKey)!, r[mi]);
  }
  const fields = series.size ? [...series] : [measure];
  if (groups.size * (fields.length + 1) > LIMIT_CELLS) throw Error("limits");
  return {
    cols: headers([group, ...fields]),
    rows: [...groups.values()].map((g) => [
      g.label,
      ...fields.map((s) => aggValue(g.buckets.get(s), agg)),
    ]),
  };
}
export function runStage(data: Grid, stage: Stage): Grid {
  const g = bare(data);
  if (stage.kind === "export") return g;
  if (stage.kind === "pivot")
    return aggregate(g, stage.col, stage.measure, stage.agg);
  if (stage.kind === "empty") {
    const c = stage.col ? index(g, stage.col) : -1;
    return {
      ...g,
      rows: g.rows.filter((r) =>
        c >= 0 ? str(r[c]).trim() !== "" : r.some((v) => str(v).trim()),
      ),
    };
  }
  if (stage.kind === "normalize") {
    const c = index(g, stage.col);
    return {
      ...g,
      rows: g.rows.map((row) =>
        row.map((v, i) => (i === c ? normalizeValue(v, stage.mode) : v)),
      ),
    };
  }
  if (
    stage.kind === "split" ||
    stage.kind === "concat" ||
    stage.kind === "profit"
  ) {
    const c = index(g, stage.col),
      other =
        stage.kind === "split"
          ? -1
          : index(g, stage.kind === "profit" ? stage.cost : stage.other);
    const outputs =
      stage.kind === "split" ? [stage.left, stage.right] : [stage.target];
    if (
      outputs.some((o) => !o.trim()) ||
      new Set(outputs).size !== outputs.length ||
      (stage.kind === "split" && !stage.separator)
    )
      throw Error("outputNames");
    const cols = [...new Set([...g.cols, ...outputs])],
      indices = outputs.map((o) => cols.indexOf(o));
    return validGrid({
      cols,
      rows: g.rows.map((row) => {
        const r = row.slice();
        if (stage.kind === "split") {
          const [first, ...tail] = str(row[c]).split(stage.separator);
          r[indices[0]] = first;
          r[indices[1]] = tail.join(stage.separator);
        } else if (stage.kind === "concat")
          r[indices[0]] = [row[c], row[other]].map(str).join(stage.separator);
        else {
          const x = num(row[c]),
            y = num(row[other]);
          if (!Number.isFinite(x) || !Number.isFinite(y))
            throw Error("numericColumn");
          r[indices[0]] = Math.round((x - y) * 100) / 100;
        }
        return r;
      }),
    });
  }
  return applyStep(g, stage);
}
export function mappedAppend(inputs: { grid: Grid; names?: string[] }[]): Grid {
  const mapped = inputs.map(({ grid, names }) => {
    if (!names) return bare(grid);
    if (
      names.length !== grid.cols.length ||
      names.some((n) => !n.trim()) ||
      new Set(names).size !== names.length
    )
      throw Error("outputNames");
    return { cols: names, rows: grid.rows };
  });
  if (!mapped.length) throw Error("empty");
  return mapped.reduce(appendTables);
}
export function quality(g: Grid) {
  const fields = g.cols.map((col) => ({
      col,
      empty: 0,
      distinct: 0,
      invalid: 0,
    })),
    seenRows = new Set<string>(),
    examples: { row: number; column: string; issue: string; value: string }[] =
      [];
  let duplicates = 0,
    blanks = 0,
    invalid = 0;
  const issue = (r: number, c: string, code: string, v: Cell) => {
    if (examples.length < 500)
      examples.push({
        row: r + 2,
        column: c,
        issue: code,
        value: str(v).slice(0, 160),
      });
  };
  for (let r = 0; r < g.rows.length; r++) {
    const k = JSON.stringify(g.rows[r]);
    if (seenRows.has(k)) {
      duplicates++;
      issue(r, "*", "duplicate", "");
    }
    seenRows.add(k);
  }
  fields.forEach((f, c) => {
    const values = new Set<Cell>();
    const mode = /телефон|phone/i.test(f.col)
      ? "phone"
      : /email|e-mail|почта/i.test(f.col)
        ? "email"
        : /дата|date/i.test(f.col)
          ? "date"
          : "";
    for (let r = 0; r < g.rows.length; r++) {
      const v = g.rows[r][c];
      if (!str(v).trim()) {
        f.empty++;
        blanks++;
        issue(r, f.col, "empty", v);
        continue;
      }
      values.add(v);
      try {
        if (mode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v)))
          throw Error();
        if (mode === "phone" || mode === "date") normalizeValue(v, mode);
      } catch {
        f.invalid++;
        invalid++;
        issue(r, f.col, mode, v);
      }
    }
    f.distinct = values.size;
  });
  return {
    rows: g.rows.length,
    columns: g.cols.length,
    duplicates,
    blanks,
    invalid,
    fields,
    examples,
  };
}
