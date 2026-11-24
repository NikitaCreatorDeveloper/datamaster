import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { businessSamples, launchSample } from "../src/businessSamples";
import type { Table } from "../src/core";

function sum(table: Table, column: string) {
  const index = table.cols.indexOf(column);
  assert.notEqual(index, -1);
  return table.rows.reduce((total, row) => total + Number(row[index]), 0);
}

test("eight bilingual templates launch fresh, editable sheets with a valid primary", async () => {
  assert.equal(new Set(businessSamples.map((s) => s.id)).size, 8);
  const ids = new Set<string>();
  for (const { id, title, description } of businessSamples) {
    assert.ok(title.every(Boolean));
    assert.ok(description.every(Boolean));
    const ru = await launchSample(id, false),
      en = await launchSample(id, true);
    for (const result of [ru, en]) {
      assert.equal(result.primary, result.tables[0].id);
      assert.ok(
        result.tables.every(
          (table) =>
            table.rows.length > 0 &&
            table.rows.every((row) => row.length === table.cols.length),
        ),
      );
      for (const table of result.tables) {
        assert.ok(!ids.has(table.id));
        ids.add(table.id);
      }
    }
    assert.notEqual(ru.tables[0].name, en.tables[0].name);
    assert.equal(ru.tables[0].rows.length, en.tables[0].rows.length);
  }
  await assert.rejects(launchSample("unknown", false), /sample/);
});

test("retail pricing and replenishment derive totals from source records", async () => {
  const {
    tables: [prices, costs],
  } = await launchSample("shop", true);
  assert.deepEqual(prices.rows[0].slice(-2), [1140, 1653]);
  assert.equal(costs.cols.length, 4);
  for (const row of prices.rows)
    assert.equal(row[4], Math.round(Number(row[3]) * 145) / 100);
  const {
    tables: [order, inventory],
  } = await launchSample("stock", true);
  assert.equal(order.rows.length, 4);
  assert.equal(sum(order, "To order"), 36);
  for (const row of inventory.rows) {
    assert.equal(row[5], Number(row[2]) - Number(row[3]));
    assert.equal(row[6], Math.max(Number(row[4]) - Number(row[5]), 0));
  }
});

test("CRM keeps six unique, normalized addresses and preserves the raw contacts", async () => {
  const {
    tables: [clean, raw],
  } = await launchSample("crm", true);
  assert.equal(raw.rows.length, 9);
  assert.equal(clean.rows.length, 6);
  assert.equal(new Set(clean.rows.map((row) => row[2])).size, 6);
  assert.ok(clean.rows.every((row) => String(row[2]).endsWith("@example.com")));
});

test("sales and finance summaries reconcile to their source ledgers", async () => {
  const {
    view,
    tables: [sales, register],
  } = await launchSample("sales", true);
  assert.equal(view, "analytics");
  assert.equal(sales.rows.length, 54);
  assert.equal(register.rows.length, 162);
  for (const col of ["Orders", "Revenue", "Expenses", "Profit"])
    assert.equal(sum(sales, col), sum(register, col));
  assert.equal(sum(sales, "Revenue"), 1653540);
  const {
    tables: [finance, ledger],
  } = await launchSample("finance", true);
  assert.equal(finance.rows.length, 6);
  assert.equal(ledger.rows.length, 30);
  for (const col of ["Revenue", "Expenses", "Profit"])
    assert.equal(sum(finance, col), sum(ledger, col));
  assert.equal(sum(finance, "Profit"), 261644);
});

test("supplier quotes match reversed keys and include freight on each side", async () => {
  const {
    tables: [comparison, first, second],
  } = await launchSample("suppliers", true);
  assert.notEqual(first.rows[0][0], second.rows[0][0]);
  for (const row of comparison.rows) {
    const counterpart = second.rows.find((quote) => quote[0] === row[0])!;
    const allIn = [
      Number(row[2]) + Number(row[3]),
      Number(counterpart[1]) + Number(counterpart[2]),
    ];
    assert.equal(row[6], Math.min(...allIn));
    assert.equal(row[7], allIn[0] <= allIn[1] ? "Kiln" : "Contour");
  }
});

test("batch imports Excel and CSV with different headers and removes the overlap", async () => {
  const {
    tables: [combined, book, csv],
  } = await launchSample("batch", true);
  assert.equal(book.format, "XLSX");
  assert.equal(csv.format, "CSV");
  assert.notDeepEqual(book.cols, csv.cols);
  assert.equal(combined.rows.length, 6);
  assert.deepEqual(
    combined.rows.map((row) => row[0]),
    ["00121", "00122", "00123", "00124", "00125", "00126"],
  );
  assert.equal(sum(combined, "Amount"), 20115);
  assert.ok(combined.rows.every((row) => typeof row[3] === "number"));
});

test("API template requests the fixture on HTTP, labels its bundled fallback, and surfaces failed requests", async () => {
  const bytes = await readFile(
    new URL("../public/samples/shipments.json", import.meta.url),
  );
  const bundled = (await launchSample("api", true)).tables[0];
  assert.match(bundled.name, /bundled JSON/);
  let served = 0,
    fail = false;
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/studio/samples/shipments.json") {
      res.writeHead(404);
      res.end();
      return;
    }
    served++;
    res.writeHead(fail ? 503 : 200, { "Content-Type": "application/json" });
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const original = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    const url = new URL(
      "http://127.0.0.1:" +
        (server.address() as { port: number }).port +
        "/studio/",
    );
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: url,
    });
    const hosted = (await launchSample("api", true)).tables[0];
    assert.deepEqual(hosted.rows, bundled.rows);
    assert.equal(hosted.format, "API");
    assert.match(hosted.name, /GET/);
    assert.equal(served, 1);
    assert.equal(sum(hosted, "Shipping fee"), 3210);
    fail = true;
    await assert.rejects(launchSample("api", true), /HTTP 503/);
    assert.equal(served, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, "location", original);
    else Reflect.deleteProperty(globalThis, "location");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
