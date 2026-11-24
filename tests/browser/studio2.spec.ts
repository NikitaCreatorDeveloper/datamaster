import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ExcelJS from "exceljs";
import { start, importFile, origin } from "./helpers";
const button = (p: Page, name: string) =>
  p.getByRole("button", { name, exact: true });
const nav = (p: Page, name: string) =>
  p.locator("nav").getByRole("button", { name: new RegExp("^" + name) });
async function download(page: Page, action: () => Promise<unknown>) {
  const wait = page.waitForEvent("download");
  await action();
  const file = await wait;
  return { file, bytes: await readFile((await file.path())!) };
}
async function edit(p: Page, col: string, row: number, v: string) {
  await button(p, col + " · " + row).click();
  const e = p.getByLabel("Значение ячейки");
  await e.fill(v);
  await e.press("Enter");
}
async function createSheet(p: Page, name: string) {
  await button(p, "Создать лист").click();
  await p.getByLabel("Название", { exact: true }).fill(name);
  await button(p, "Сохранить").click();
  await expect(p.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function allowStorage(p: Page) {
  await nav(p, "Проекты").click();
  await button(p, "Разрешить сохранение").click();
  await button(p, "Разрешить").click();
  await expect(p.getByText("Сохранено на устройстве")).toBeVisible();
}
test("blank workbook, clipboard rectangle, dependent formula, undo/redo, freeze, styling and sheet lifecycle", async ({
  page,
}) => {
  await start(page);
  await nav(page, "Таблицы").click();
  await createSheet(page, "План продаж");
  await page.locator(".sheet-scroll").evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "10\t2\n20\t3");
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: dt }),
    );
  });
  await expect(button(page, "B · 2")).toHaveText("3");
  await edit(page, "C", 1, "=A2*B2");
  await expect(button(page, "C · 1")).toHaveText("20");
  await edit(page, "A", 1, "15");
  await expect(button(page, "C · 1")).toHaveText("30");
  await button(page, "Отменить").click();
  await expect(button(page, "C · 1")).toHaveText("20");
  await button(page, "Повторить").click();
  await expect(button(page, "C · 1")).toHaveText("30");
  await button(page, "C · 1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Вставить строку" }).click();
  await expect(button(page, "C · 2")).toHaveText("30");
  await page.getByLabel("Структура листа").selectOption("rowDel");
  await expect(button(page, "C · 1")).toHaveText("30");
  await button(page, "C · 1").click();
  await page.getByLabel("Значение ячейки").press("Escape");
  await button(page, "Жирный").click();
  await page.getByLabel("Тип данных").selectOption("currency");
  await button(page, "Размеры и закрепление").click();
  await page.getByLabel("Ширина столбца, px").fill("220");
  await page.getByLabel("Высота строки, px").fill("46");
  await page.getByLabel("Закрепить верхние строки").fill("1");
  await page.getByLabel("Закрепить левые столбцы").fill("1");
  await button(page, "Применить").click();
  await button(page, "Условное форматирование").click();
  await page.getByLabel("Правило", { exact: true }).selectOption("greater");
  await page.getByLabel("Значение", { exact: true }).fill("10");
  await button(page, "Добавить правило").click();
  await button(page, "Экспорт").click();
  const { bytes } = await download(page, () =>
    button(page, "Скачать файл").click(),
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as any);
  const cell = wb.worksheets[0].getCell("C2");
  expect(cell.result).toBe(30);
  expect(cell.font.bold).toBe(true);
  expect(cell.numFmt).toContain("₽");
  expect(wb.worksheets[0].views[0]).toMatchObject({ xSplit: 1, ySplit: 2 });
  await button(page, "Действия с листом").click();
  await button(page, "Копировать лист").click();
  await page.getByLabel("Название", { exact: true }).fill("Копия");
  await button(page, "Сохранить").click();
  await expect(page.getByRole("heading", { name: "Копия" })).toBeVisible();
  await button(page, "Действия с листом").click();
  await button(page, "Переименовать").click();
  await page.getByLabel("Название", { exact: true }).fill("Архив");
  await button(page, "Сохранить").click();
  await expect(page.getByRole("heading", { name: "Архив" })).toBeVisible();
  await button(page, "Действия с листом").click();
  await button(page, "Удалить таблицу").click();
  await button(page, "Удалить").click();
  await expect(page.getByRole("heading", { name: "Архив" })).toHaveCount(0);
});
test("analytics filters, three charts, saved report, PNG and Cyrillic PDF", async ({
  page,
}) => {
  await start(page);
  await importFile(
    page,
    "продажи.json",
    Buffer.from(
      JSON.stringify([
        { Месяц: "2026-01", Канал: "A", Выручка: 100, Расходы: 70 },
        { Месяц: "2026-02", Канал: "A", Выручка: 150, Расходы: 90 },
        { Месяц: "2026-02", Канал: "B", Выручка: 50, Расходы: 20 },
      ]),
    ),
  );
  await nav(page, "Аналитика").click();
  await expect(page.locator(".kpi b").first()).toHaveText("300");
  await page.getByLabel("Фильтр", { exact: true }).selectOption("Канал");
  await page.getByLabel("Значение фильтра").fill("A");
  await expect(page.locator(".kpi b")).toHaveText(["250", "160", "90", "50%"]);
  const imgs = new Set<string>();
  for (const chart of ["Столбцы", "Линия", "Круг"]) {
    await button(page, chart).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(button(page, chart)).toHaveClass("on");
    imgs.add(await page.locator("canvas").evaluate((el) => el.toDataURL()));
  }
  expect(imgs.size).toBe(3);
  const png = await download(page, () => button(page, "PNG").click());
  expect(png.bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(png.bytes.readUInt32BE(16)).toBeGreaterThan(200);
  const pdf = await download(page, () => button(page, "PDF").click());
  expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: pdf.bytes,
  }).toString();
  expect(text).toContain("Выручка");
  expect(text).toContain("2026-02");
  expect(text).toContain("250");
  await button(page, "Сохранить панель").click();
  await page.getByRole("dialog").locator("input").fill("Канал А");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(button(page, "Канал А")).toBeVisible();
  await nav(page, "Обзор").click();
  await nav(page, "Аналитика").click();
  await button(page, "Канал А").click();
  await expect(page.locator(".kpi b").first()).toHaveText("250");
});
test("opt-in IndexedDB, independent projects, imported project, restore, remove and revoke consent", async ({
  page,
}) => {
  await start(page);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name),
    ),
  ).not.toContain("DataMaster-Studio");
  await nav(page, "Проекты").click();
  await button(page, "Создать проект").click();
  await page.getByLabel("Название проекта").fill("Портфель");
  await button(page, "Создать").click();
  await nav(page, "Таблицы").click();
  await createSheet(page, "Смета");
  await edit(page, "A", 1, "42");
  await allowStorage(page);
  const archived = await download(page, () =>
    button(page, "Экспорт проекта Портфель").click(),
  );
  const json = JSON.parse(archived.bytes.toString());
  expect(json.project.tables[0].rows[0][0]).toBe(42);
  await page.reload();
  await nav(page, "Проекты").click();
  await expect(page.locator(".projectcard.current h2")).toHaveText("Портфель");
  await nav(page, "Таблицы").click();
  await page.getByText("Смета", { exact: true }).click();
  await expect(button(page, "A · 1")).toHaveText("42");
  await expect(page.getByText("Сохранено на устройстве")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Смета" })).toBeVisible();
  await expect(button(page, "A · 1")).toHaveText("42");
  await nav(page, "Проекты").click();
  json.project.name = "Импортированный";
  await page.getByLabel("Файл проекта").setInputFiles({
    name: "copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.locator(".projectcard.current h2")).toHaveText(
    "Импортированный",
  );
  await button(page, "Удалить проект Импортированный").click();
  await button(page, "Удалить").click();
  await expect(
    page.getByRole("heading", { name: "Импортированный" }),
  ).toHaveCount(0);
  await button(page, "Отключить").click();
  await button(page, "Удалить").click();
  await expect(button(page, "Разрешить сохранение")).toBeVisible();
  await page.reload();
  await nav(page, "Проекты").click();
  await expect(page.locator(".projectcard")).toHaveCount(1);
});
test("batch files XLSX + CSV, mapped columns, intermediate preview, workflow JSON and real result export", async ({
  page,
}) => {
  await start(page);
  await nav(page, "Конструктор").click();
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Orders").addRows([
    ["sku", "qty"],
    ["A", 2],
    ["A", 2],
  ]);
  await page.getByLabel("Тип источника").selectOption("files");
  const inputs = [
    {
      name: "north.xlsx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    },
    {
      name: "south.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("code,count\nB,3"),
    },
  ];
  await page.getByLabel("Файлы пакета").setInputFiles(inputs);
  await page.getByLabel("Объединить перед обработкой").check();
  await button(page, "Сопоставить столбцы").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("south", { exact: true }).click();
  await dlg.getByLabel("code", { exact: true }).fill("sku");
  await dlg.getByLabel("count", { exact: true }).fill("qty");
  await button(page, "Готово").click();
  await page.getByLabel("Добавить шаг").selectOption("normalize");
  await page.getByLabel("Исходный столбец").selectOption("qty");
  await page.getByLabel("Нормализовать").selectOption("number");
  await page.getByLabel("Добавить шаг").selectOption("export");
  await page.getByLabel("Формат", { exact: true }).selectOption("JSON");
  await page.getByLabel("Название сценария").fill("Склад");
  await button(page, "Сохранить").click();
  const archive = await download(page, () => button(page, "JSON").click());
  expect(JSON.parse(archive.bytes.toString()).pipeline.stages).toHaveLength(3);
  expect(JSON.parse(archive.bytes.toString()).pipeline.source.mode).toBe(
    "files",
  );
  await nav(page, "Обзор").click();
  await nav(page, "Конструктор").click();
  await page.getByLabel("JSON сценария").setInputFiles({
    name: "recipe.json",
    mimeType: "application/json",
    buffer: archive.bytes,
  });
  await expect(page.getByLabel("Тип источника")).toHaveValue("files");
  await page.getByLabel("Файлы пакета").setInputFiles(inputs);
  await expect(page.getByLabel("Объединить перед обработкой")).toBeChecked();
  await button(page, "Выполнить сценарий").click();
  await expect(button(page, "Применить результат")).toBeEnabled();
  await expect(page.locator("progress")).toHaveJSProperty("value", 3);
  await page.getByText("Промежуточные результаты (3)").click();
  await expect(page.locator("details[open] table")).toHaveCount(3);
  await page.getByText("Журнал выполнения").click();
  await expect(page.locator("pre.code")).toContainText("Расчёт завершён");
  const result = await download(page, () =>
    button(page, "Применить результат").click(),
  );
  expect(JSON.parse(result.bytes.toString())).toEqual([
    { sku: "A", qty: 2 },
    { sku: "B", qty: 3 },
  ]);
  await nav(page, "Таблицы").click();
  await expect(page.getByText("Склад · north", { exact: true })).toBeVisible();
});
test("50,000 rows virtualize and allow worker cancellation without committing partial output", async ({
  page,
}) => {
  test.setTimeout(65000);
  await start(page);
  const rowCount = 50000;
  await importFile(
    page,
    "large.csv",
    Buffer.from(
      "id,qty\n" +
        Array.from({ length: rowCount }, (_, i) => i + 1 + "," + i).join("\n"),
    ),
  );
  await expect(page.locator(".sheet-scroll tbody tr").first()).toBeVisible();
  expect(await page.locator(".sheet-scroll tbody tr").count()).toBeLessThan(60);
  await page
    .locator(".sheet-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(button(page, "id · 50000")).toBeVisible();
  await edit(page, "qty", 50000, "75000");
  await expect(button(page, "qty · 50000")).toHaveText("75000");
  await nav(page, "Конструктор").click();
  await page.getByLabel("Лист-источник").selectOption({ label: "large" });
  for (let i = 0; i < 5; i++)
    await page.getByLabel("Добавить шаг").selectOption("sort");
  await button(page, "Выполнить сценарий").click();
  await button(page, "Остановить").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(button(page, "Применить результат")).toBeDisabled();
  await nav(page, "Таблицы").click();
  await page.getByText("large", { exact: true }).click();
  await page.getByLabel("Поиск в таблице").fill("75000");
  await expect(button(page, "qty · 50000")).toHaveText("75000");
});
test("data-quality details, literal HTML, mobile English/dark layouts and local file privacy", async ({
  page,
}) => {
  const outgoing: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
      outgoing.push(r.url());
  });
  await start(page);
  const literal = "<b>customer</b>";
  await importFile(
    page,
    "contacts.json",
    Buffer.from(
      JSON.stringify([
        { Email: "broken", Name: literal },
        { Email: "broken", Name: literal },
        { Email: "", Name: "Ada" },
      ]),
    ),
  );
  await expect(button(page, "Name · 1")).toHaveText(literal);
  expect(await button(page, "Name · 1").locator("b").count()).toBe(0);
  await nav(page, "Качество данных").click();
  await expect(button(page, "CSV")).toBeEnabled();
  const csv = await download(page, () => button(page, "CSV").click());
  expect(csv.bytes.toString()).toContain("Повтор строки");
  expect(csv.bytes.toString()).toContain("broken");
  await page.getByTitle("Switch to English").click();
  await button(page, "Switch theme").click();
  await page.setViewportSize({ width: 360, height: 740 });
  for (const dest of [
    "Analytics",
    "API Studio",
    "Workflow builder",
    "Projects",
  ]) {
    await button(page, "Open navigation").click();
    await nav(page, dest).click();
    await expect(
      page.getByRole("heading", { name: dest, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(outgoing).toEqual([]);
});

test("range selection, fill handle, bulk edit, copy and relative references", async ({
  page,
}) => {
  await start(page);
  await nav(page, "Таблицы").click();
  await createSheet(page, "План");
  await edit(page, "A", 1, "10");
  await edit(page, "A", 2, "20");
  const first = page.locator('td[data-cell="A2"]'),
    second = page.locator('td[data-cell="A3"]');
  await first.locator("button").click();
  await page.getByLabel("Значение ячейки").press("Escape");
  await second.locator("button").click({ modifiers: ["Shift"] });
  const handle = await second.locator(".fill-handle").boundingBox(),
    dest = await page.locator('td[data-cell="A5"]').boundingBox();
  expect(handle).toBeTruthy();
  expect(dest).toBeTruthy();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(dest!.x + dest!.width / 2, dest!.y + dest!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(button(page, "A · 4")).toHaveText("40");
  await edit(page, "B", 1, "=A2*2");
  await button(page, "B · 1").click();
  await page.getByLabel("Значение ячейки").press("Escape");
  await button(page, "B · 4").click({ modifiers: ["Shift"] });
  await page.locator(".sheet-scroll").focus();
  await page.keyboard.press("Control+d");
  await expect(button(page, "B · 4")).toHaveText("80");
  const copied = await page.locator(".sheet-scroll").evaluate((el) => {
    const clipboard = new DataTransfer();
    el.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, clipboardData: clipboard }),
    );
    return clipboard.getData("text/plain");
  });
  expect(copied.split("\n")).toEqual(["20", "40", "60", "80"]);
  await button(page, "Заполнить диапазон").click();
  await page.getByRole("dialog").locator("textarea").fill("9");
  await button(page, "Готово").click();
  await expect(button(page, "B · 1")).toHaveText("9");
  await expect(button(page, "B · 4")).toHaveText("9");
});
test("two tabs detect IndexedDB write conflicts without overwriting the newer project", async ({
  page,
  context,
}) => {
  await start(page);
  await allowStorage(page);
  const second = await context.newPage();
  await start(second, origin, "Проекты");
  await button(second, "Создать проект").click();
  await second.getByLabel("Название проекта").fill("Из второй вкладки");
  await button(second, "Создать").click();
  await expect(second.getByText("Сохранено на устройстве")).toBeVisible();
  await nav(page, "Таблицы").click();
  await expect(page.getByRole("alert")).toContainText("другой вкладке");
  await page.reload();
  await expect(page.locator(".projectcard.current h2")).toHaveText(
    "Из второй вкладки",
  );
  await second.close();
});
