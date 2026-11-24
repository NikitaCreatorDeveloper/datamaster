// Excel coordinates include the header row. Only explicit spreadsheet functions are callable.
import {
  type Cell,
  type Table,
  LIMIT_CELLS,
  LIMIT_COLS,
  LIMIT_ROWS,
} from "../core";
export function colName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
export const address = (r: number, c: number) => colName(c) + (r + 2);
export function coords(ref: string): [number, number] {
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/i.exec(ref);
  if (!m) throw Error("#REF!");
  let c = 0;
  for (const char of m[1].toUpperCase()) c = c * 26 + char.charCodeAt(0) - 64;
  return [Number(m[2]) - 2, c - 1];
}
type Node =
  | { kind: "literal"; v: Cell }
  | { kind: "ref"; ref: string }
  | { kind: "range"; from: string; to: string }
  | { kind: "unary"; op: string; arg: Node }
  | { kind: "op"; op: string; a: Node; b: Node }
  | { kind: "fn"; name: string; args: Node[] };
const token =
  /\s*(?:"(?:[^"]|"")*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?|\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_.]*|#REF!|<=|>=|<>|[+\-*/^&=><%(),:;])/giy;
const precedence: Record<string, number> = {
  "=": 1,
  "<>": 1,
  "<": 1,
  ">": 1,
  "<=": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5,
};
export function parseFormula(expression: string): Node {
  const text = expression.replace(/^=/, "").trim();
  if (text.length > 4096) throw Error("#LIMIT!");
  token.lastIndex = 0;
  const ts: string[] = [];
  let end = 0;
  while (end < text.length) {
    const m = token.exec(text);
    if (!m) throw Error("#PARSE!");
    ts.push(m[0].trim());
    end = token.lastIndex;
  }
  let p = 0,
    depth = 0;
  function need(v: string) {
    if (ts[p++] !== v) throw Error("#PARSE!");
  }
  function read(min = 0): Node {
    if (++depth > 96) throw Error("#LIMIT!");
    const value = ts[p++];
    if (!value) throw Error("#PARSE!");
    let n: Node;
    if (value === "+" || value === "-")
      n = { kind: "unary", op: value, arg: read(5) };
    else if (value === "(") {
      n = read();
      need(")");
    } else if (value.startsWith('"'))
      n = { kind: "literal", v: value.slice(1, -1).replaceAll('""', '"') };
    else if (/^(?:\d|\.)/.test(value))
      n = { kind: "literal", v: Number(value) };
    else if (value === "#REF!") n = { kind: "ref", ref: value };
    else if (ts[p] === "(") {
      p++;
      const args: Node[] = [];
      if (ts[p] !== ")") {
        for (;;) {
          args.push(read());
          if (![",", ";"].includes(ts[p])) break;
          p++;
        }
      }
      need(")");
      n = {
        kind: "fn",
        name: value.toUpperCase().replace(/^_XLFN\./, ""),
        args,
      };
    } else if (/^(TRUE|FALSE)$/i.test(value))
      n = { kind: "literal", v: value.toUpperCase() === "TRUE" };
    else if (/^\$?[A-Z]+\$?\d+$/i.test(value)) {
      if (ts[p] === ":") {
        p++;
        const to = ts[p++];
        coords(to || "");
        n = { kind: "range", from: value, to };
      } else n = { kind: "ref", ref: value };
    } else throw Error("#NAME?");
    while (ts[p] === "%") {
      p++;
      n = { kind: "unary", op: "%", arg: n };
    }
    while (Object.hasOwn(precedence, ts[p]) && precedence[ts[p]] >= min) {
      const op = ts[p++];
      n = {
        kind: "op",
        op,
        a: n,
        b: read(precedence[op] + (op === "^" ? 0 : 1)),
      };
    }
    depth--;
    return n;
  }
  const ast = read();
  if (p !== ts.length) throw Error("#PARSE!");
  return ast;
}
const functions = new Set([
  "SUM",
  "AVERAGE",
  "MIN",
  "MAX",
  "COUNT",
  "IF",
  "ROUND",
  "COUNTIF",
  "SUMIF",
  "VLOOKUP",
  "XLOOKUP",
]);
export function supportsFormula(expression: string): boolean {
  function allowed(node: Node): boolean {
    switch (node.kind) {
      case "fn":
        return functions.has(node.name) && node.args.every(allowed);
      case "op":
        return allowed(node.a) && allowed(node.b);
      case "unary":
        return allowed(node.arg);
      default:
        return true;
    }
  }
  try {
    return allowed(parseFormula(expression));
  } catch {
    return false;
  }
}
type Value = Cell | Cell[][];
function scalar(v: Value): Cell {
  if (Array.isArray(v)) throw Error("#VALUE!");
  return v;
}
const flat = (v: Value): Cell[] => (Array.isArray(v) ? v.flat() : [v]);
function numeric(v: Cell) {
  if (v === null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw Error("#VALUE!");
  return n;
}
function cmp(a: Cell, b: Cell) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "")
    .toLowerCase()
    .localeCompare(String(b ?? "").toLowerCase(), undefined, { numeric: true });
}
function comparison(op: string, a: Cell, b: Cell) {
  const x = cmp(a, b);
  return op === "="
    ? x === 0
    : op === "<>"
      ? x !== 0
      : op === ">"
        ? x > 0
        : op === "<"
          ? x < 0
          : op === ">="
            ? x >= 0
            : x <= 0;
}
function matchCriteria(value: Cell, criteria: Cell) {
  const s = String(criteria ?? ""),
    m = /^(<=|>=|<>|=|>|<)(.*)$/.exec(s),
    v = m ? m[2] : s;
  return comparison(
    m?.[1] || "=",
    value,
    typeof value === "number" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : v,
  );
}
export function recalculate<T extends Table>(table: T): T {
  const forms = table.meta?.formulas;
  if (!forms || !Object.keys(forms).length) return table;
  const cache = new Map<string, Cell>(),
    active = new Set<string>(),
    errors = new Map<string, string>(),
    rows = table.rows.slice(),
    cloned = new Set<number>();
  let work = 0;
  const limit = () => {
    if (++work > 5_000_000) throw Error("#LIMIT!");
  };
  function lookup(ref: string): Cell {
    limit();
    const [r, c] = coords(ref),
      key = address(r, c);
    if (c >= LIMIT_COLS || r >= LIMIT_ROWS) throw Error("#REF!");
    if (errors.has(key)) throw Error(errors.get(key));
    if (cache.has(key)) return cache.get(key)!;
    if (r === -1) return table.cols[c] ?? null;
    if (!Object.hasOwn(forms!, key)) return table.rows[r]?.[c] ?? null;
    if (active.has(key)) throw Error("#CYCLE!");
    if (active.size > 256) throw Error("#LIMIT!");
    active.add(key);
    try {
      const value = scalar(evaluate(parseFormula(forms![key])));
      if (typeof value === "number" && !Number.isFinite(value))
        throw Error("#NUM!");
      cache.set(key, value);
      return value;
    } catch (e) {
      const error =
        e instanceof Error && e.message.startsWith("#") ? e.message : "#VALUE!";
      errors.set(key, error);
      throw Error(error);
    } finally {
      active.delete(key);
    }
  }
  function evaluate(n: Node): Value {
    limit();
    if (n.kind === "literal") return n.v;
    if (n.kind === "ref") return lookup(n.ref);
    if (n.kind === "range") {
      const [r, c] = coords(n.from),
        [r2, c2] = coords(n.to);
      const loR = Math.min(r, r2),
        hiR = Math.max(r, r2),
        loC = Math.min(c, c2),
        hiC = Math.max(c, c2);
      if ((hiR - loR + 1) * (hiC - loC + 1) > LIMIT_CELLS)
        throw Error("#LIMIT!");
      return Array.from({ length: hiR - loR + 1 }, (_, i) =>
        Array.from({ length: hiC - loC + 1 }, (_, j) =>
          lookup(address(loR + i, loC + j)),
        ),
      );
    }
    if (n.kind === "unary") {
      const v = numeric(scalar(evaluate(n.arg)));
      return n.op === "-" ? -v : n.op === "%" ? v / 100 : v;
    }
    if (n.kind === "op") {
      const a = scalar(evaluate(n.a)),
        b = scalar(evaluate(n.b));
      if (precedence[n.op] === 1) return comparison(n.op, a, b);
      if (n.op === "&") return String(a ?? "") + String(b ?? "");
      const x = numeric(a),
        y = numeric(b);
      switch (n.op) {
        case "+":
          return x + y;
        case "-":
          return x - y;
        case "*":
          return x * y;
        case "/":
          if (y === 0) throw Error("#DIV/0!");
          return x / y;
        default:
          return x ** y;
      }
    }
    const arg = (i: number) => {
      if (!n.args[i]) throw Error("#VALUE!");
      return evaluate(n.args[i]);
    };
    const one = (i: number) => scalar(arg(i));
    if (n.name === "IF") return one(0) ? arg(1) : n.args[2] ? arg(2) : false;
    if (n.name === "ROUND") {
      const power = 10 ** numeric(one(1)),
        x = numeric(one(0));
      return (
        (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * power)) /
        power
      );
    }
    if (n.name === "COUNTIF" || n.name === "SUMIF") {
      const values = flat(arg(0)),
        crit = one(1),
        sums = n.args[2] ? flat(arg(2)) : values;
      if (n.name === "SUMIF" && sums.length !== values.length)
        throw Error("#VALUE!");
      return values.reduce<number>(
        (sum, v, i) =>
          sum +
          (matchCriteria(v, crit)
            ? n.name === "COUNTIF"
              ? 1
              : typeof sums[i] === "number"
                ? Number(sums[i])
                : 0
            : 0),
        0,
      );
    }
    if (n.name === "XLOOKUP") {
      const val = one(0),
        keys = flat(arg(1)),
        vals = flat(arg(2));
      if (keys.length !== vals.length || n.args.length > 4)
        throw Error("#VALUE!");
      const i = keys.findIndex((k) => cmp(k, val) === 0);
      if (i < 0) {
        if (n.args[3]) return arg(3);
        throw Error("#N/A");
      }
      return vals[i];
    }
    if (n.name === "VLOOKUP") {
      const val = one(0),
        range = arg(1),
        col = numeric(one(2)) - 1,
        approx = n.args[3] ? Boolean(one(3)) : true;
      if (
        !Array.isArray(range) ||
        !Number.isInteger(col) ||
        col < 0 ||
        col >= range[0].length
      )
        throw Error("#REF!");
      let found: Cell[] | undefined;
      for (const row of range) {
        const diff = cmp(row[0], val);
        if (diff === 0) {
          found = row;
          break;
        }
        if (approx && diff < 0) found = row;
      }
      if (!found) throw Error("#N/A");
      return found[col];
    }
    if (!["SUM", "AVERAGE", "MIN", "MAX", "COUNT"].includes(n.name))
      throw Error("#NAME?");
    let count = 0,
      sum = 0,
      min = Infinity,
      max = -Infinity;
    for (const a of n.args)
      for (const v of flat(evaluate(a)))
        if (typeof v === "number") {
          count++;
          sum += v;
          min = Math.min(v, min);
          max = Math.max(v, max);
        }
    switch (n.name) {
      case "SUM":
        return sum;
      case "COUNT":
        return count;
      case "MIN":
        return count ? min : 0;
      case "MAX":
        return count ? max : 0;
      default:
        if (!count) throw Error("#DIV/0!");
        return sum / count;
    }
  }
  for (const key of Object.keys(forms)) {
    const [r, c] = coords(key);
    if (!rows[r] || c < 0 || c >= table.cols.length) continue;
    if (!cloned.has(r)) {
      rows[r] = rows[r].slice();
      cloned.add(r);
    }
    try {
      rows[r][c] = lookup(key);
    } catch (e) {
      rows[r][c] = e instanceof Error ? e.message : "#VALUE!";
    }
  }
  return { ...table, rows };
}
// String literals are preserved when translating references during fill and structural edits.
export function rewriteRefs(
  formula: string,
  move: (
    r: number,
    c: number,
    absR: boolean,
    absC: boolean,
  ) => [number, number] | null,
) {
  return formula.replace(
    /"(?:[^"]|"")*"|(?<![A-Z0-9_.$])(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)(?![A-Z0-9_(])/gi,
    (whole, a, letters, b, digits) => {
      if (whole[0] === '"') return whole;
      const [r, c] = coords(letters + digits),
        next = move(r, c, !!b, !!a);
      return !next || next[0] < -1 || next[1] < 0
        ? "#REF!"
        : a + colName(next[1]) + b + (next[0] + 2);
    },
  );
}
