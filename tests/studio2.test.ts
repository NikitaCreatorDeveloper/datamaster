import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { fromJSON, type Table, type Grid, type Cell } from "../src/core";
import { encode, parseFile } from "../src/io";
import {
  address,
  colName,
  coords,
  supportsFormula,
  rewriteRefs,
} from "../src/studio/formulas";
import {
  applyStyle,
  blankSheet,
  editCells,
  fillRange,
  layout,
  ruleChecker,
  typedValue,
  uniqueSheetName,
} from "../src/studio/sheets";
import { readBook, encodeBook } from "../src/studio/excel";
import {
  aggregate,
  mappedAppend,
  normalizeValue,
  quality,
  runStage,
} from "../src/studio/process";
import { defaultChart, calculateReport } from "../src/studio/analytics";
import {
  decodePipeline,
  decodeProject,
  pipelineFile,
  projectFile,
} from "../src/studio/projectFormat";
import {
  apiURL,
  emptyRequest,
  flattenRecords,
  loadTemplate,
  sanitizeRequest,
  requestData,
} from "../src/studio/api";
import { execute } from "../src/studio/taskRunner";
import type { Pipeline } from "../src/studio/model";
function table(cols: string[], rows: Cell[][]): Table {
  return { ...blankSheet("Накладная"), cols, rows };
}
const base = () =>
  table(
    ["SKU", "Цена", "Кол-во", "Итог"],
    [
      ["A", 10, 3, null],
      ["B", 20, 2, null],
      ["C", 30, 1, null],
    ],
  );
const cell = (r: number, c: number, value: string) => ({ r, c, value });
const pos = (r: number, c: number, endR = r, endC = c) => ({
  r,
  c,
  endR,
  endC,
});
test("Excel export validates each parsed function, including nested calls with digits in their name", () => {
  assert.equal(supportsFormula("=IF(TRUE, SUM(2,3), LOG10(2))"), false);
  assert.equal(supportsFormula('=IF(TRUE,"LOG10(2)",ROUND(B2,2))'), true);
});
test("A1 addressing, relative anchors and quoted text", () => {
  for (const c of [0, 25, 26, 51, 52, 299])
    assert.deepEqual(coords(address(893, c)), [893, c]);
  assert.equal(colName(299), "KN");
  assert.equal(
    rewriteRefs('="A2"&A2+$B$3+C$4+$D5', (r, c, ar, ac) => [
      ar ? r : r + 1,
      ac ? c : c + 2,
    ]),
    '="A2"&C3+$B$3+E$4+$D6',
  );
});
const expressions: [string, Cell][] = [
  ["=B2*C2+(10-4)/2", 33],
  ["=SUM(B2:B4)", 60],
  ["=AVERAGE(B2:B4)", 20],
  ["=MIN(B2:B4)", 10],
  ["=MAX(B2:B4)", 30],
  ["=COUNT(A2:B4)", 3],
  ['=IF(B2=10;"ok";1/0)', "ok"],
  ["=ROUND(-3.125,2)", -3.13],
  ['=COUNTIF(B2:B4,">=20")', 2],
  ['=SUMIF(A2:A4,"B",B2:B4)', 20],
  ['=VLOOKUP("B",A2:C4,2,FALSE)', 20],
  ['=XLOOKUP("C",A2:A4,B2:B4)', 30],
  ['=XLOOKUP("D",A2:A4,B2:B4,"missing")', "missing"],
];
for (const [formula, expected] of expressions)
  test("formula " + formula, () =>
    assert.equal(editCells(base(), [cell(0, 3, formula)]).rows[0][3], expected),
  );
test("dependencies, source immutability, cycle and propagated errors", () => {
  const src = base(),
    a = editCells(src, [cell(0, 3, "=B2*C2"), cell(1, 3, "=D2+1")]),
    b = editCells(a, [cell(0, 1, "40")]);
  assert.equal(b.rows[1][3], 121);
  assert.equal(a.rows[1][3], 31);
  assert.equal(src.rows[0][3], null);
  const cycle = editCells(a, [cell(0, 3, "=D3"), cell(2, 3, "=D2")]);
  assert.deepEqual(
    cycle.rows.map((r) => r[3]),
    Array(3).fill("#CYCLE!"),
  );
  const errors = editCells(src, [
    cell(0, 3, "=1/0"),
    cell(1, 3, "=UNKNOWN(B2)"),
    cell(2, 3, "=3+"),
  ]);
  assert.deepEqual(
    errors.rows.map((r) => r[3]),
    ["#DIV/0!", "#NAME?", "#PARSE!"],
  );
});
test("literal text, percentages, dates and non-contiguous paste are lossless", () => {
  let a = applyStyle(base(), pos(0, 0), { type: "text" });
  a = editCells(a, [cell(0, 0, "=1+1"), cell(2, 6, "0055")]);
  assert.equal(a.rows[0][0], "=1+1");
  assert.equal(a.rows[2][6], "0055");
  assert.equal(a.rows[2][5], null);
  assert.equal(typedValue("12,5%", "percent"), 0.125);
  assert.equal(typedValue("1 250,50 ₽", "currency"), 1250.5);
  assert.throws(() => typedValue("2025-02-30", "date"));
  assert.throws(() => editCells(a, [cell(100001, 0, "x")]), /limits/);
});
test("row/column edits rebase dependencies, sizes and formatting; autofill advances sequences", () => {
  let a = editCells(base(), [cell(0, 3, "=B2*C2")]);
  a = applyStyle(a, pos(0, 3), { bold: true, fill: "#f0ddcc" });
  const f = fillRange(a, pos(0, 3), pos(0, 3, 2, 3));
  assert.deepEqual(
    f.rows.map((r) => r[3]),
    [30, 40, 30],
  );
  assert.equal(f.meta?.formulas?.D4, "=B4*C4");
  const insert = layout(f, "col", "add", 1);
  assert.equal(insert.meta?.formulas?.E2, "=C2*D2");
  assert.equal(insert.meta?.styles?.E2.bold, true);
  const move = layout(insert, "row", "after", 0);
  assert.equal(move.rows[1][4], 30);
  assert.equal(move.meta?.formulas?.E3, "=C3*D3");
  assert.equal(layout(move, "col", "remove", 2).rows[1][3], "#REF!");
  const series = fillRange(base(), pos(0, 1, 1, 1), pos(0, 1, 4, 1));
  assert.equal(series.rows[4][1], 50);
});
test("highlight rules distinguish empty, duplicates and numeric thresholds", () => {
  const a = table(
    ["SKU", "Price"],
    [
      ["A", 0],
      ["A", 8],
      ["B", null],
    ],
  );
  a.meta = {
    rules: [
      { kind: "duplicate", col: "SKU", value: "", color: "#ffeeaa" },
      { kind: "empty", col: "Price", value: "", color: "#ff0000" },
      { kind: "greater", col: "Price", value: "5", color: "#00ff00" },
    ],
  };
  const color = ruleChecker(a);
  assert.equal(color(0, 0), "#ffeeaa");
  assert.equal(color(1, 1), "#00ff00");
  assert.equal(color(2, 1), "#ff0000");
  assert.equal(color(0, 1), undefined);
});
test("XLSX workbook round trip with cached formulas, layout, styles and native conditional rules", async () => {
  let a = editCells(base(), [
    cell(0, 3, "=SUM(B2;C2)"),
    cell(1, 3, '=XLOOKUP("B",A2:A4,B2:B4)'),
  ]);
  a = applyStyle(a, pos(0, 3), {
    bold: true,
    border: true,
    align: "center",
    color: "#332211",
    fill: "#ffeeaa",
    font: "Georgia",
    type: "currency",
  });
  a.meta = {
    ...a.meta,
    heights: { 0: 54 },
    widths: { 3: 170 },
    frozenRows: 1,
    frozenCols: 1,
    rules: [{ col: "Цена", kind: "greater", value: "10", color: "#faeddc" }],
  };
  const blob = await encodeBook([a, blankSheet("Пустой", 3, 12)]),
    bytes = await blob.arrayBuffer(),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.equal(wb.worksheets.length, 2);
  const sheet = wb.worksheets[0];
  assert.equal(sheet.getCell("D2").formula, "SUM(B2,C2)");
  assert.equal(sheet.getCell("D2").result, 13);
  assert.match(sheet.getCell("D3").formula, /_xlfn.XLOOKUP/);
  assert.equal(sheet.getCell("D2").font.name, "Georgia");
  assert.equal(sheet.getRow(2).height, 40.5);
  const [back, empty] = await readBook(new File([bytes], "book.xlsx"), "book");
  assert.equal(back.rows[1][3], 20);
  assert.equal(back.meta?.styles?.D2.type, "currency");
  assert.equal(back.meta?.frozenCols, 1);
  assert.deepEqual(back.meta?.rules, a.meta.rules);
  assert.equal(empty.rows.length, 12);
  const again = new ExcelJS.Workbook();
  await again.xlsx.load(await (await encodeBook([back, empty])).arrayBuffer());
  assert.deepEqual(
    again.worksheets.map((sh) => sh.name),
    ["Накладная", "Пустой"],
  );
});
test("Excel cached unsupported formulas, valid sheet names and malformed archives", async () => {
  const book = new ExcelJS.Workbook(),
    ws = book.addWorksheet("raw");
  ws.addRows([["price"], [{ formula: "ABS(-7)", result: 7 }]]);
  const [a] = await readBook(
    new File([new Uint8Array(await book.xlsx.writeBuffer())], "raw.xlsx"),
    "raw",
  );
  assert.equal(a.rows[0][0], 7);
  assert.deepEqual(a.meta?.formulas, {});
  const used = new Set<string>();
  assert.equal(uniqueSheetName("A:B", used), "A B");
  assert.equal(uniqueSheetName("a b", used), "a b (2)");
  await assert.rejects(parseFile(new File(["broken"], "bad.xlsx")));
  await assert.rejects(parseFile(new File(["{}"], "bad.json")));
});
test("extended cleaning, splitting, concatenation, profits and explicit column mapping", () => {
  assert.equal(normalizeValue("8 (900) 000-11-22", "phone"), "+79000001122");
  assert.equal(normalizeValue("02.03.2026", "date"), "2026-03-02");
  assert.throws(() => normalizeValue("31.02.2026", "date"), /date/);
  assert.equal(normalizeValue("  Кофе　  1 ", "text"), "Кофе 1");
  assert.equal(normalizeValue("1 200,25 ₽", "number"), 1200.25);
  const g = {
    cols: ["customer", "sell", "buy"],
    rows: [
      ["Анна Иванова", 100, 70],
      [null, 50, 42],
    ],
  };
  const valid = runStage(g, { kind: "empty", col: "customer" });
  const split = runStage(valid, {
      kind: "split",
      col: "customer",
      separator: " ",
      left: "first",
      right: "last",
    }),
    concat = runStage(split, {
      kind: "concat",
      col: "last",
      other: "first",
      separator: ", ",
      target: "contact",
    }),
    profit = runStage(concat, {
      kind: "profit",
      col: "sell",
      cost: "buy",
      target: "net",
    });
  assert.deepEqual(profit.rows[0].slice(3), [
    "Анна",
    "Иванова",
    "Иванова, Анна",
    30,
  ]);
  assert.equal(g.cols.length, 3);
  const combined = mappedAppend([
    { grid: { cols: ["sku", "quantity"], rows: [["A", 1]] } },
    {
      grid: { cols: ["count", "code"], rows: [[3, "B"]] },
      names: ["quantity", "sku"],
    },
  ]);
  assert.deepEqual(combined.rows, [
    ["A", 1],
    ["B", 3],
  ]);
  assert.throws(
    () => mappedAppend([{ grid: combined, names: ["x", "x"] }]),
    /outputNames/,
  );
});
test("quality report reconciles fields and records example coordinates", () => {
  const q = quality({
    cols: ["email", "date", "phone"],
    rows: [
      ["a@ex.net", "2025-04-30", "+12025550101"],
      ["a@ex.net", "2025-04-30", "+12025550101"],
      ["bad", "", "oops"],
    ],
  });
  assert.deepEqual([q.duplicates, q.blanks, q.invalid], [1, 1, 2]);
  assert.ok(q.examples.some((x) => x.row === 4 && x.column === "email"));
});
test("pivot aggregation, interactive filter model and KPI periods", () => {
  const g = table(
    ["Month", "Market", "Revenue", "Cost"],
    [
      ["2026-01", "A", 100, 70],
      ["2026-02", "A", 150, 90],
      ["2026-02", "B", 50, 20],
    ],
  );
  for (const [agg, expected] of [
    ["sum", 200],
    ["mean", 100],
    ["min", 50],
    ["max", 150],
    ["count", 2],
  ] as const)
    assert.equal(aggregate(g, "Month", "Revenue", agg).rows[1][1], expected);
  assert.deepEqual(aggregate(g, "Month", "Revenue", "sum", "Market").rows, [
    ["2026-01", 100, null],
    ["2026-02", 150, 50],
  ]);
  const rep = calculateReport(g, {
    ...defaultChart(g),
    filterCol: "Market",
    filterValue: "A",
  });
  assert.deepEqual(
    [rep.rows, rep.revenue, rep.cost, rep.profit, rep.change],
    [2, 250, 160, 90, 50],
  );
  assert.equal(
    calculateReport(g, { ...defaultChart(g), revenue: "" }).change,
    null,
  );
});
test("batch workflow gives progress and new sheets; a failed stage preserves all inputs", async () => {
  const files = [
    new File(["sku,qty\nA,2\nA,2"], "n.csv"),
    new File(['[{"sku":"B","qty":"3"}]'], "s.json"),
  ];
  const sources = (await execute({ op: "import", files })) as Table[],
    before = JSON.stringify(sources),
    progress: number[] = [];
  const res = (await execute(
    {
      op: "pipeline",
      inputs: sources,
      combine: true,
      stages: [
        { kind: "dedupe", col: "sku" },
        { kind: "normalize", col: "qty", mode: "number" },
        { kind: "export", format: "JSON" },
      ],
    },
    (p) => progress.push(p.done),
  )) as Grid[];
  assert.deepEqual(res[0].rows, [
    ["A", 2],
    ["B", 3],
  ]);
  assert.deepEqual(progress, [1, 2, 3]);
  assert.equal(JSON.stringify(sources), before);
  await assert.rejects(
    execute({
      op: "pipeline",
      inputs: sources,
      combine: false,
      stages: [{ kind: "normalize", col: "sku", mode: "number" }],
    }),
    /1.*numericColumn/,
  );
  assert.equal(JSON.stringify(sources), before);
});
test("versioned project and workflow imports validate shapes, deserialize formulas and recalculate stale values", async () => {
  const src = editCells(base(), [cell(0, 3, "=B2*C2")]),
    pipe: Pipeline = {
      id: "p",
      name: "Clean",
      stages: [{ kind: "dedupe", col: "SKU" }],
    };
  const data = projectFile({
    id: "project1",
    name: "Studio",
    tables: [src],
    recipes: [],
    pipelines: [pipe],
    boards: [defaultChart(src)],
  });
  data.project.tables[0].rows[0][3] = -999;
  assert.equal(decodeProject(data).tables[0].rows[0][3], 30);
  assert.equal(decodePipeline(pipelineFile(pipe)).name, "Clean");
  const imported = (await execute({
    op: "projectImport",
    file: new File([JSON.stringify(data)], "project.json"),
  })) as ReturnType<typeof decodeProject>;
  assert.equal(imported.boards.length, 1);
  assert.notEqual(decodePipeline(pipelineFile(pipe)).id, pipe.id);
  assert.throws(() => decodeProject({ ...data, version: 8 }), /projectFormat/);
  assert.throws(
    () => decodePipeline(pipelineFile({ ...pipe, stages: [] })),
    /projectFormat/,
  );
  data.project.tables[0].rows[0].pop();
  assert.throws(() => decodeProject(data), /projectFormat/);
});
test("REST flattening, safe request templates and protocol boundaries", () => {
  const spec = {
    ...emptyRequest(),
    url: "https://example.com/v2/customers/private123?session=hidden",
    auth: "bearer" as const,
    headers: '{"X-API-Key":"raw-secret"}',
    params: '{"limit":"777"}',
    body: '{"hide":"body"}',
    token: "bearer-123",
  };
  const template = sanitizeRequest(spec, "Orders"),
    serialized = JSON.stringify(template),
    restored = loadTemplate(template);
  for (const value of [
    "private123",
    "hidden",
    "raw-secret",
    "777",
    "bearer-123",
    '"hide"',
  ])
    assert.ok(!serialized.includes(value));
  assert.equal(restored.url, "https://example.com/v2/customers/{id}");
  assert.equal(restored.token, "");
  assert.throws(() => apiURL("https://name:password@example.com"));
  const flat = flattenRecords(
    [
      {
        id: 1,
        customer: { city: "Kazan", token: "sensitive" },
        "customer.city": "literal",
        marks: [{ privateKey: "X", a: 1 }],
        echo: "sample123",
      },
    ],
    ["sample123"],
  );
  assert.deepEqual(flat.cols, [
    "id",
    "customer.city",
    "customer\\.city",
    "marks",
    "echo",
  ]);
  assert.deepEqual(flat.rows[0], [
    1,
    "Kazan",
    "literal",
    '[{"a":1}]',
    "[redacted]",
  ]);
});
test("cursor pagination, empty/invalid JSON, upper bound and cancellation isolate network outcomes", async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    urls.push(u.href);
    return Response.json({
      list: [{ id: urls.length }],
      next: urls.length === 1 ? "two" : null,
    });
  };
  const s = {
    ...emptyRequest(),
    url: "https://test.invalid/items",
    path: "list",
    paging: "cursor" as const,
    pageParam: "after",
    cursorPath: "next",
  };
  const response = await requestData(s, new AbortController().signal);
  assert.equal(response.pages, 2);
  assert.deepEqual(response.grid?.rows, [[1], [2]]);
  assert.match(urls[1], /after=two/);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal((await requestData(s, new AbortController().signal)).grid, null);
  globalThis.fetch = async () => new Response("bad json");
  assert.equal(
    (await requestData(s, new AbortController().signal)).dataError,
    "json",
  );
  globalThis.fetch = async () =>
    new Response("x", {
      headers: { "Content-Length": String(18 * 1024 * 1024) },
    });
  await assert.rejects(requestData(s, new AbortController().signal), /size/);
  globalThis.fetch = async () => {
    throw Error("abort");
  };
  await assert.rejects(requestData(s, AbortSignal.abort()), /abort/);
});
test("text cells stay literal on CSV and XLSX export; malformed size is rejected before expansion", async () => {
  const g = {
    cols: ["data"],
    rows: [["=SUM(1,2)"], ["<b>literal</b>"], [-12]],
  };
  const csv = await (await encode(g, "CSV")).text();
  assert.ok(csv.includes("'=SUM"));
  assert.match(csv, /-12/);
  const [round] = await readBook(
    new File([await encode(g, "XLSX")], "escape.xlsx"),
    "escape",
  );
  assert.equal(round.rows[0][0], "=SUM(1,2)");
  assert.deepEqual(round.meta?.formulas, {});
  assert.throws(
    () =>
      fromJSON([
        Object.fromEntries(
          Array.from({ length: 301 }, (_, i) => ["col" + i, i]),
        ),
      ]),
    /limits/,
  );
});
