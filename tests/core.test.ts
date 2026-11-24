import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStep,
  appendTables,
  compareTables,
  fromJSON,
  headers,
  joinTables,
  matrix,
  runRecipe,
  validGrid,
} from "../src/core";
import { encode, parseFile, fetchGrid } from "../src/io";
import { demo, templates } from "../src/demo";
const g = {
  cols: ["sku", "price", "name"],
  rows: [
    ["01", 15, "Tea"],
    ["02", 10, "Mix"],
    ["01", 15, "Tea"],
  ],
};
test("deduplication preserves first occurrence and source", () => {
  const r = applyStep(g, { kind: "dedupe", col: "sku" });
  assert.equal(r.rows.length, 2);
  assert.equal(g.rows.length, 3);
  assert.deepEqual(r, applyStep(g, { kind: "dedupe", col: "" }));
});
test("locale numbers, blanks, negative markup and new column", () => {
  assert.deepEqual(
    applyStep(
      { cols: ["price"], rows: [["1 250,50"], [null]] },
      { kind: "price", col: "price", target: "new", percent: -20 },
    ).rows,
    [
      ["1 250,50", 1000.4],
      [null, null],
    ],
  );
});
test("invalid price cells fail atomically", () => {
  assert.throws(
    () =>
      applyStep(g, { kind: "price", col: "name", target: "price", percent: 2 }),
    /numericColumn/,
  );
  assert.equal(g.rows[0][1], 15);
});
test("sorting, filtering, replacement and exact literal use", () => {
  assert.equal(
    applyStep(g, { kind: "sort", col: "price", desc: false }).rows[0][1],
    10,
  );
  assert.equal(
    applyStep(g, { kind: "filter", col: "name", op: "contains", value: "TE" })
      .rows.length,
    2,
  );
  assert.equal(
    applyStep(g, { kind: "replace", col: "name", find: "T", value: "$&" })
      .rows[0][2],
    "$&ea",
  );
});
test("price and automation validation do not partially modify input", () => {
  assert.throws(
    () =>
      runRecipe(g, [
        { kind: "sort", col: "price", desc: false },
        { kind: "dedupe", col: "missing" },
      ]),
    /column/,
  );
  assert.equal(g.rows[0][0], "01");
});
test("append aligns partially overlapping columns", () => {
  assert.deepEqual(
    appendTables(
      { cols: ["a", "b"], rows: [[1, 2]] },
      { cols: ["b", "c"], rows: [[3, 4]] },
    ),
    {
      cols: ["a", "b", "c"],
      rows: [
        [1, 2, null],
        [null, 3, 4],
      ],
    },
  );
});
test("left join includes unmatched rows and disambiguates names", () => {
  assert.deepEqual(
    joinTables(
      g,
      { cols: ["code", "name"], rows: [["02", "B"]] },
      "sku",
      "code",
    ),
    {
      cols: ["sku", "price", "name", "name (2)"],
      rows: [
        ["01", 15, "Tea", null],
        ["02", 10, "Mix", "B"],
        ["01", 15, "Tea", null],
      ],
    },
  );
  assert.throws(() => joinTables(g, g, "sku", "sku"), /uniqueKey/);
});
test("comparison finds additions, deletions and altered values", () => {
  const d = compareTables(
    {
      cols: ["a", "v"],
      rows: [
        [1, 2],
        [2, 3],
      ],
    },
    {
      cols: ["b", "v"],
      rows: [
        [1, 4],
        [3, 3],
      ],
    },
    "a",
    "b",
    true,
  );
  assert.deepEqual(
    d.rows.map((x) => x[1]),
    ["Changed", "Removed", "Added"],
  );
  assert.deepEqual(d.rows[0], ["1", "Changed", "v", 2, 4]);
});
test("source parsing normalizes blank and duplicate labels", () => {
  assert.deepEqual(headers(["", "", "Column 1"]), [
    "Column 1",
    "Column 2",
    "Column 1 (2)",
  ]);
  assert.deepEqual(matrix([["a", "b"], [1], [null, null]]).rows, [[1, null]]);
});
test("JSON supports uneven keys and nested values", () => {
  assert.deepEqual(fromJSON([{ id: 1 }, { id: 2, meta: { x: true } }]), {
    cols: ["id", "meta"],
    rows: [
      [1, null],
      [2, '{"x":true}'],
    ],
  });
  assert.throws(() => fromJSON([null]), /json/);
  assert.throws(() => fromJSON({}), /json/);
});
test("demo scenarios have verifiable business outcomes", () => {
  const [prices, clean, sales] = templates;
  assert.equal(runRecipe(demo(clean.source), clean.steps).rows.length, 140);
  assert.equal(runRecipe(demo(sales.source), sales.steps).rows.length, 720);
  const r = runRecipe(demo(prices.source), prices.steps);
  assert.equal(r.cols.at(-1), "Розничная цена");
  assert.equal(
    r.rows[0].at(-1),
    Math.round(Number(r.rows[0][3]) * 1.15 * 100) / 100,
  );
});
test("CSV with quoted multiline fields, separators, BOM and leading zeros", async () => {
  const [a] = await parseFile(
    new File(['\uFEFFid;name\r\n001;"a;b\nsecond"'], "sample.csv"),
  );
  assert.deepEqual(a.rows, [["001", "a;b\nsecond"]]);
  const b = await encode({ cols: ["value"], rows: [["=1+1"], ["@x"]] }, "CSV");
  assert.match(await b.text(), /'=1\+1/);
});
test("XLSX and JSON typed round trip including Unicode", async () => {
  const data = {
    cols: ["id", "Цена", "В наличии"],
    rows: [
      ["001", 24.4, true],
      ["002", null, false],
    ],
  };
  for (const format of ["XLSX", "JSON"] as const) {
    const bytes = await encode(data, format);
    const [a] = await parseFile(
      new File([bytes], "demo." + format.toLowerCase()),
    );
    assert.deepEqual(a.cols, data.cols);
    assert.deepEqual(a.rows, data.rows);
  }
});
test("invalid files and oversize grids fail with clear errors", async () => {
  await assert.rejects(parseFile(new File(["bad"], "x.xls")), /format/);
  await assert.rejects(parseFile(new File(['"unclosed'], "a.csv")), /csv/);
  assert.throws(
    () =>
      validGrid({
        cols: Array.from({ length: 301 }, (_, i) => String(i)),
        rows: [],
      }),
    /limits/,
  );
});
test("REST rejects non-HTTPS and URL credentials before sending", async () => {
  for (const url of ["http://example.com", "https://u:p@example.com", "bad"])
    await assert.rejects(
      fetchGrid(url, "", "", new AbortController().signal),
      /url/,
    );
});
test("realized markup uses paired price columns, rounds and handles zero cost", () => {
  const result = applyStep(
    {
      cols: ["cost", "sale"],
      rows: [
        [10, 12.5],
        [0, 5],
        [3, 4],
        [null, 9],
        [10, null],
      ],
    },
    { kind: "markup", col: "cost", sale: "sale", target: "markup %" },
  );
  assert.deepEqual(
    result.rows.map((r) => r.at(-1)),
    [25, null, 33.33, null, null],
  );
});
test("multisheet workbook uses data from every nonempty sheet and cached formulas", async () => {
  const {
    default: { Workbook },
  } = await import("exceljs");
  const book = new Workbook();
  const a = book.addWorksheet("Sales");
  a.addRows([
    ["sku", "total"],
    ["A", { formula: "2+3", result: 5 }],
  ]);
  book.addWorksheet("Empty");
  book.addWorksheet("Cost").addRows([["cost"], [2]]);
  const sheets = await parseFile(
    new File([new Uint8Array(await book.xlsx.writeBuffer())], "multi.xlsx"),
  );
  assert.deepEqual(
    sheets.map((x) => x.name),
    ["multi · Sales", "multi · Cost"],
  );
  assert.equal(sheets[0].rows[0][1], 5);
});
