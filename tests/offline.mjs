import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage(),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  const address = "https://offline-demo.test/DataMaster.html";
  await page.route(address, (r) =>
    r.fulfill({
      path: path.resolve("release/DataMaster.html"),
      contentType: "text/html",
    }),
  );
  await page.goto(address);
  await page.context().setOffline(true);
  await page
    .getByRole("heading", { name: "Рабочее пространство" })
    .waitFor({ timeout: 6000 });
  await page.getByRole("button", { name: /Демо Обновление прайса/ }).click();
  await page.getByRole("button", { name: "Запустить сценарий" }).click();
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать файл" }).click();
  const download = await pending;
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  await page.getByRole("button", { name: "Импорт файлов" }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles({
      name: "roundtrip.xlsx",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
  await page.getByRole("heading", { name: "roundtrip" }).waitFor();
  assert.equal(
    await page.getByRole("columnheader", { name: "Розничная цена" }).count(),
    1,
  );
  assert.deepEqual(requests, [address]);
  assert.deepEqual(errors, []);
  console.log(
    "Offline single-document smoke passed: scenario; XLSX download and reimport; no requests after loading the document and no runtime errors.",
  );
} finally {
  await browser.close();
}
