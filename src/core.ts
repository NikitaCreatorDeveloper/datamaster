export type Cell = string | number | boolean | null;
export type Grid = { cols: string[]; rows: Cell[][] };
export type Format = "XLSX" | "CSV" | "JSON" | "API";
export type Table = Grid & {
  id: string;
  name: string;
  format: Format;
  demo?: boolean;
  updated: number;
  steps: Step[];
};
export type Step =
  | { kind: "dedupe"; col: string }
  | { kind: "sort"; col: string; desc: boolean }
  | {
      kind: "filter";
      col: string;
      op: "contains" | "equal" | "gt" | "lt" | "filled";
      value: string;
    }
  | { kind: "replace"; col: string; find: string; value: string }
  | { kind: "price"; col: string; target: string; percent: number }
  | { kind: "markup"; col: string; sale: string; target: string };
export type Recipe = { id: string; name: string; steps: Step[] };
export const LIMIT_ROWS = 100000,
  LIMIT_COLS = 300,
  LIMIT_CELLS = 1500000;
export function validGrid(g: Grid): Grid {
  if (!g.cols.length) throw Error("empty");
  if (
    g.rows.length > LIMIT_ROWS ||
    g.cols.length > LIMIT_COLS ||
    g.rows.length * g.cols.length > LIMIT_CELLS
  )
    throw Error("limits");
  return g;
}
export function headers(names: unknown[]): string[] {
  const used = new Set<string>();
  return names.map((n, i) => {
    const base = String(n ?? "").trim() || "Column " + (i + 1);
    let name = base,
      c = 2;
    while (used.has(name)) {
      name = base + " (" + c + ")";
      c += 1;
    }
    used.add(name);
    return name;
  });
}
export const str = (v: Cell | undefined) => String(v ?? "");
function num(v: Cell | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.trim()) return NaN;
  return Number(
    v
      .trim()
      .replace(/[\s\u00a0]/g, "")
      .replace(",", "."),
  );
}
export function applyStep(g: Grid, s: Step): Grid {
  const idx = g.cols.indexOf(s.col),
    cell = (r: Cell[]) => r[idx];
  if (idx < 0 && !(s.kind === "dedupe" && s.col === "")) throw Error("column");
  switch (s.kind) {
    case "dedupe": {
      const seen = new Set<string>();
      return {
        ...g,
        rows: g.rows.filter((r) => {
          const k = JSON.stringify(idx < 0 ? r : cell(r));
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
      };
    }
    case "sort":
      return {
        ...g,
        rows: [...g.rows].sort((a, b) => {
          const x = num(cell(a)),
            y = num(cell(b));
          const diff =
            Number.isFinite(x) && Number.isFinite(y)
              ? x - y
              : str(cell(a)).localeCompare(str(cell(b)), "ru", {
                  numeric: true,
                  sensitivity: "base",
                });
          return s.desc ? -diff : diff;
        }),
      };
    case "filter": {
      const val = s.value.toLocaleLowerCase();
      if ((s.op === "gt" || s.op === "lt") && !Number.isFinite(num(val)))
        throw Error("number");
      return {
        ...g,
        rows: g.rows.filter((r) => {
          const c = cell(r),
            v = str(c).toLocaleLowerCase();
          switch (s.op) {
            case "contains":
              return v.includes(val);
            case "equal":
              return v === val;
            case "gt":
              return num(c) > num(val);
            case "lt":
              return num(c) < num(val);
            case "filled":
              return !!v.trim();
          }
        }),
      };
    }
    case "replace": {
      if (!s.find) throw Error("find");
      return {
        ...g,
        rows: g.rows.map((r) =>
          str(cell(r)).includes(s.find)
            ? r.map((v, i) =>
                i === idx ? str(v).split(s.find).join(s.value) : v,
              )
            : r,
        ),
      };
    }
    case "price":
    case "markup": {
      if (
        (s.kind === "price" && !Number.isFinite(s.percent)) ||
        !s.target.trim()
      )
        throw Error("number");
      const salesIndex = s.kind === "markup" ? g.cols.indexOf(s.sale) : -1;
      if (s.kind === "markup" && salesIndex < 0) throw Error("column");
      if (
        s.kind === "markup" &&
        g.rows.some(
          (r) =>
            str(r[salesIndex]).trim() && !Number.isFinite(num(r[salesIndex])),
        )
      )
        throw Error("numericColumn");
      const target = s.target.trim(),
        existing = g.cols.indexOf(target);
      if (
        g.rows.some(
          (r) => str(cell(r)).trim() && !Number.isFinite(num(cell(r))),
        )
      )
        throw Error("numericColumn");
      const cols = existing < 0 ? [...g.cols, target] : g.cols;
      return validGrid({
        cols,
        rows: g.rows.map((row) => {
          const r = [...row],
            n = num(cell(row));
          const sale = num(r[salesIndex]);
          const raw =
            s.kind === "price"
              ? n * (1 + s.percent / 100)
              : Number.isFinite(sale) && n !== 0
                ? ((sale - n) / n) * 100
                : NaN;
          const v = Number.isNaN(raw) ? null : Math.round(raw * 100) / 100;
          if (v !== null && !Number.isFinite(v)) throw Error("number");
          r[existing < 0 ? g.cols.length : existing] = v;
          return r;
        }),
      });
    }
  }
}
export const runRecipe = (g: Grid, steps: Step[]) => steps.reduce(applyStep, g);
export function appendTables(a: Grid, b: Grid): Grid {
  const cols = [...new Set([...a.cols, ...b.cols])];
  const map = (g: Grid) => {
    const ids = cols.map((c) => g.cols.indexOf(c));
    return g.rows.map((r) => ids.map((i) => r[i] ?? null));
  };
  return validGrid({ cols, rows: [...map(a), ...map(b)] });
}
function keyed(g: Grid, key: string) {
  const i = g.cols.indexOf(key);
  if (i < 0) throw Error("column");
  const m = new Map<string, Cell[]>();
  for (const r of g.rows) {
    const k = str(r[i]);
    if (!k.trim() || m.has(k)) throw Error("uniqueKey");
    m.set(k, r);
  }
  return m;
}
export function joinTables(a: Grid, b: Grid, ka: string, kb: string): Grid {
  const lookup = keyed(b, kb),
    ai = a.cols.indexOf(ka);
  if (ai < 0) throw Error("column");
  const ext = b.cols.map((v, i) => ({ v, i })).filter((c) => c.v !== kb);
  const cols = headers([...a.cols, ...ext.map((c) => c.v)]);
  return validGrid({
    cols,
    rows: a.rows.map((r) => {
      const match = lookup.get(str(r[ai]));
      return [...r, ...ext.map((c) => match?.[c.i] ?? null)];
    }),
  });
}
export function compareTables(
  a: Grid,
  b: Grid,
  ka: string,
  kb: string,
  en = false,
): Grid {
  const left = keyed(a, ka),
    right = keyed(b, kb),
    fields = [
      ...new Set([
        ...a.cols.filter((c) => c !== ka),
        ...b.cols.filter((c) => c !== kb),
      ]),
    ];
  const rows: Cell[][] = [];
  const push = (r: Cell[]) => {
    if (rows.length >= LIMIT_ROWS) throw Error("limits");
    rows.push(r);
  };
  for (const [k, r] of left) {
    const other = right.get(k);
    if (!other) {
      push([k, en ? "Removed" : "Удалено", null, JSON.stringify(r), null]);
      continue;
    }
    for (const c of fields) {
      const ai = a.cols.indexOf(c),
        bi = b.cols.indexOf(c),
        x = r[ai],
        y = other[bi];
      if (x !== y)
        push([k, en ? "Changed" : "Изменено", c, x ?? null, y ?? null]);
    }
  }
  for (const [k, r] of right)
    if (!left.has(k))
      push([k, en ? "Added" : "Добавлено", null, null, JSON.stringify(r)]);
  return validGrid({
    cols: en
      ? ["Key", "Change", "Column", "Before", "After"]
      : ["Ключ", "Изменение", "Столбец", "До", "После"],
    rows,
  });
}
export function fromJSON(value: unknown): Grid {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((x) => typeof x !== "object" || x === null || Array.isArray(x))
  )
    throw Error("json");
  const keys = [...new Set(value.flatMap((x) => Object.keys(x)))];
  if (keys.length * value.length > LIMIT_CELLS) throw Error("limits");
  return validGrid({
    cols: headers(keys),
    rows: value.map((o) =>
      keys.map((k) => {
        const v = Object.hasOwn(o, k) ? o[k] : null;
        return typeof v === "object" && v !== null
          ? JSON.stringify(v)
          : (v ?? null);
      }),
    ),
  });
}
export function matrix(data: Cell[][]): Grid {
  if (!data.length) throw Error("empty");
  const width = data.reduce((m, r) => Math.max(m, r.length), 0);
  if (width > LIMIT_COLS || width * data.length > LIMIT_CELLS + width)
    throw Error("limits");
  const cols = headers(Array.from({ length: width }, (_, i) => data[0][i]));
  return validGrid({
    cols,
    rows: data
      .slice(1)
      .filter((r) => r.some((c) => c !== null && c !== ""))
      .map((r) => cols.map((_, i) => r[i] ?? null)),
  });
}
