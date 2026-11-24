import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
const { Workbook } = ExcelJS;
const origin = "https://datamaster.test";
const screens = path.resolve("docs/screenshots");
async function start(page: Page, appOrigin = origin) {
  // Serve the exact production assets to the test browser with the production CSP.
  const headers = await readFile("dist/_headers", "utf8");
  const csp = headers
    .split("\n")
    .find((x) => x.includes("Content-Security-Policy:"))!
    .split(": ")
    .slice(1)
    .join(": ");
  await page.route(appOrigin + "/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.join(
      process.cwd(),
      "dist",
      pathname === "/" ? "index.html" : pathname,
    );
    await route.fulfill({
      path: file,
      headers: { "Content-Security-Policy": csp },
    });
  });
  await page.goto(appOrigin);
  await page.getByRole("heading", { name: "Рабочее пространство" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function importFile(page: Page, name: string, body: Buffer) {
  await page
    .getByRole("button", { name: "Импорт файлов", exact: true })
    .click();
  await page
    .getByTestId("file-input")
    .setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer: body,
    });
  await expect(
    page.getByRole("heading", { name: name.replace(/\.[^.]+$/, "") }),
  ).toBeVisible();
}
async function shot(page: Page, name: string) {
  if (process.env.PORTFOLIO_SCREENSHOTS === "1") {
    await mkdir(screens, { recursive: true });
    await page.screenshot({
      path: path.join(screens, name + ".png"),
      animations: "disabled",
      fullPage: true,
    });
  }
}
test("dashboard, scenarios, themes, language and mobile navigation", async ({
  page,
}) => {
  const err: string[] = [];
  page.on("pageerror", (e) => err.push(e.message));
  await start(page);
  await expect(page.getByText("1 464", { exact: true })).toBeVisible();
  await shot(page, "01-workspace");
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await shot(page, "02-dark");
  await page.getByTitle("Switch to English").click();
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByTitle("Переключить на русский").click();
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "03-mobile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("button", { name: /^Сценарии/ }).click();
  await page.getByRole("button", { name: /Очистка клиентской базы/ }).click();
  await page.getByRole("button", { name: "Запустить сценарий" }).click();
  await expect(page.getByText(/Строк 140/)).toBeVisible();
  expect(err).toEqual([]);
});
test("CSV import, edits, Escape, dedupe, save and replay, undo, export, no data egress", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith("blob:"))
      external.push(r.url());
  });
  await start(page);
  await importFile(
    page,
    "orders.csv",
    Buffer.from(
      "id;name;price\n001;Private_test_value;12\n001;Private_test_value;12\n002;Coffee;20",
    ),
  );
  const nameCell = page.getByRole("button", { name: "name · 1", exact: true });
  await nameCell.click();
  await page.getByLabel("Значение ячейки").fill("Changed");
  await page.getByLabel("Значение ячейки").press("Escape");
  await expect(nameCell).toHaveText("Private_test_value");
  await nameCell.click();
  await page.getByLabel("Значение ячейки").fill("Edited");
  await page.getByLabel("Значение ячейки").press("Enter");
  await expect(nameCell).toHaveText("Edited");
  await page.getByRole("button", { name: "Операции", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Операция", exact: true })
    .selectOption("dedupe");
  await page
    .getByRole("combobox", { name: "Столбец", exact: true })
    .selectOption("id");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText(/Строк 2 ·/)).toBeVisible();
  await page.getByRole("button", { name: /Сохранить сценарий/ }).click();
  await page.getByLabel("Название", { exact: true }).fill("Unique orders");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByText(/Строк 3 ·/)).toBeVisible();
  await page.getByRole("button", { name: /^Сценарии/ }).click();
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.getByLabel("Источник данных").selectOption({ label: "orders" });
  await page.getByRole("button", { name: "Запустить сценарий" }).click();
  await expect(page.getByText(/Строк 2 ·/)).toBeVisible();
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать файл" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("orders.json");
  expect(JSON.parse(await readFile((await file.path())!, "utf8"))[0]).toEqual({
    id: "001",
    name: "Edited",
    price: "12",
  });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "Private_test_value",
  );
  expect(external).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Рабочее пространство" }),
  ).toBeVisible();
  await expect(page.getByText("orders", { exact: true })).toHaveCount(0);
});
test("Excel and JSON imports; Excel and CSV downloads; compare and undo", async ({
  page,
}) => {
  await start(page);
  const wb = new Workbook();
  const ws = wb.addWorksheet("Prices");
  ws.addRows([
    ["ID", "Цена"],
    ["A", 10],
    ["B", 20],
  ]);
  await importFile(
    page,
    "before.xlsx",
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  await importFile(
    page,
    "after.json",
    Buffer.from(
      JSON.stringify([
        { ID: "A", Цена: 12 },
        { ID: "C", Цена: 30 },
      ]),
    ),
  );
  await page.getByRole("button", { name: "Объединить / сравнить" }).click();
  await page.getByLabel("Режим").selectOption("compare");
  await page.getByLabel("Основная таблица").selectOption({ label: "before" });
  await page.getByLabel("Вторая таблица").selectOption({ label: "after" });
  await page.getByRole("button", { name: "Создать таблицу" }).click();
  await expect(
    page.getByRole("heading", { name: /Сравнение · before/ }),
  ).toBeVisible();
  for (const s of ["Изменено", "Добавлено", "Удалено"])
    await expect(
      page.getByRole("button", { name: /Изменение ·/ }).filter({ hasText: s }),
    ).toBeVisible();
  for (const format of ["XLSX", "CSV"]) {
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await page.getByRole("button", { name: format, exact: true }).click();
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать файл" }).click();
    const bytes = await readFile((await (await wait).path())!);
    if (format === "XLSX") {
      const back = new Workbook();
      await back.xlsx.load(bytes as any);
      expect(back.worksheets[0].rowCount).toBe(4);
    } else expect(bytes.toString()).toContain("Добавлено");
  }
  await page.getByRole("button", { name: "История", exact: true }).click();
  await page.getByRole("button", { name: "Отменить последнюю" }).click();
  await expect(page.getByText(/Создана таблица · Сравнение/)).toHaveCount(0);
});
test("price scenario, editor search, pagination and desktop screenshot", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: /Демо Обновление прайса/ }).click();
  await page.getByRole("button", { name: "Запустить сценарий" }).click();
  await expect(
    page.getByRole("columnheader", { name: "Розничная цена" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Следующая страница" }).click();
  await expect(page.getByText("2 / 13")).toBeVisible();
  await page.getByLabel("Поиск в таблице").fill("DM-10001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Поиск в таблице").fill("");
  await page
    .getByRole("button", { name: "Закрыть", exact: true })
    .click({ timeout: 500 })
    .catch(() => {});
  await shot(page, "04-editor");
});
test("live cross-origin HTTPS GET, bearer preflight, denial and credential cleanup", async ({
  browser,
}) => {
  const { createServer } = await import("node:https"),
    { mkdtemp, rm } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process"),
    { tmpdir } = await import("node:os");
  const dir = await mkdtemp(path.join(tmpdir(), "datamaster-api-"));
  const key = path.join(dir, "key.pem"),
    cert = path.join(dir, "cert.pem");
  let appOrigin = "";
  const token = "one-request-fixture",
    methods: string[] = [];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  let server: ReturnType<typeof createServer> | undefined,
    appServer: ReturnType<typeof createServer> | undefined;
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-keyout",
        key,
        "-out",
        cert,
        "-subj",
        "/CN=localhost",
      ],
      { stdio: "ignore" },
    );
    server = createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      (req, res) => {
        if (req.url === "/deny") {
          res.end("[]");
          return;
        }
        methods.push(req.method!);
        res.setHeader("Access-Control-Allow-Origin", appOrigin);
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Authorization");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
        if (
          req.headers.authorization !== "Bearer " + token ||
          req.headers.cookie ||
          req.headers.referer
        ) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { items: [{ id: 7, amount: 100 }] } }));
      },
    );
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const endpoint =
      "https://127.0.0.1:" + (server.address() as { port: number }).port;
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    const policy = (await readFile("dist/_headers", "utf8"))
      .split("\n")
      .find((x) => x.includes("Content-Security-Policy:"))!
      .split(": ")[1];
    appServer = createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      async (req, res) => {
        const asset = new URL(req.url!, "https://localhost").pathname;
        const name = asset === "/" ? "index.html" : asset.slice(1);
        try {
          const bytes = await readFile(path.join("dist", name));
          res.writeHead(200, {
            "Content-Type":
              mime[path.extname(name)] || "application/octet-stream",
            "Content-Security-Policy": policy,
          });
          res.end(bytes);
        } catch {
          res.writeHead(404);
          res.end();
        }
      },
    );
    await new Promise<void>((resolve) =>
      appServer!.listen(0, "127.0.0.1", resolve),
    );
    appOrigin =
      "https://127.0.0.1:" + (appServer.address() as { port: number }).port;
    const page = await ctx.newPage();
    await page.goto(appOrigin);
    await page.getByRole("button", { name: "REST API", exact: true }).click();
    await page.getByLabel("Адрес источника").fill(endpoint + "/deny");
    await page.getByRole("button", { name: "Загрузить данные" }).click();
    await expect(page.getByRole("alert")).toContainText("CORS");
    await page.getByLabel("Адрес источника").fill(endpoint + "/items");
    await page.getByLabel("Название таблицы").fill("API inventory");
    await page.getByLabel("Путь к массиву").fill("data.items");
    await page.getByLabel(/Bearer-токен/).fill(token);
    await page.getByRole("button", { name: "Загрузить данные" }).click();
    await expect(
      page.getByRole("heading", { name: "API inventory" }),
    ).toBeVisible();
    expect(methods).toEqual(["OPTIONS", "GET"]);
    await expect(page.getByRole("button", { name: "amount · 1" })).toHaveText(
      "100",
    );
    await page.getByRole("button", { name: "REST API", exact: true }).click();
    await expect(page.getByLabel(/Bearer-токен/)).toHaveValue("");
    expect(
      await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
    ).not.toContain(token);
  } finally {
    await ctx.close();
    if (appServer)
      await new Promise<void>((resolve) => appServer!.close(() => resolve()));
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("price and markup calculation, literal replacement, filter and left join in the editor", async ({
  page,
}) => {
  await start(page);
  await importFile(
    page,
    "goods.json",
    Buffer.from(
      JSON.stringify([
        { sku: "tea", cost: 20, name: "Tea" },
        { sku: "pot", cost: 40, name: "Pot" },
      ]),
    ),
  );
  const operations = async (kind: string) => {
    await page.getByRole("button", { name: "Операции", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Операция", exact: true })
      .selectOption(kind);
  };
  const column = page.getByRole("combobox", { name: "Столбец", exact: true }),
    apply = page.getByRole("button", { name: "Применить", exact: true });
  await operations("price");
  await column.selectOption("cost");
  await page.getByLabel("Наценка, %").fill("25");
  await page.getByLabel("Столбец результата").fill("retail");
  await apply.click();
  await expect(page.getByRole("button", { name: "retail · 2" })).toHaveText(
    "50",
  );
  await operations("markup");
  await page
    .getByRole("combobox", { name: "Себестоимость" })
    .selectOption("cost");
  await page
    .getByRole("combobox", { name: "Цена продажи" })
    .selectOption("retail");
  await page.getByLabel("Столбец результата").fill("markup");
  await apply.click();
  await expect(page.getByRole("button", { name: "markup · 1" })).toHaveText(
    "25",
  );
  await operations("replace");
  await column.selectOption("name");
  await page.getByLabel("Найти текст").fill("Tea");
  await page.getByLabel("Заменить на").fill("Green tea");
  await apply.click();
  await expect(page.getByRole("button", { name: "name · 1" })).toHaveText(
    "Green tea",
  );
  await operations("filter");
  await column.selectOption("cost");
  await page.getByRole("combobox", { name: "Условие" }).selectOption("gt");
  await page.getByLabel("Значение", { exact: true }).fill("30");
  await apply.click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await importFile(
    page,
    "stock.json",
    Buffer.from('[{"code":"pot","stock":7}]'),
  );
  await page.getByRole("button", { name: "Объединить / сравнить" }).click();
  await page.getByLabel("Режим").selectOption("join");
  await page.getByLabel("Основная таблица").selectOption({ label: "goods" });
  await page.getByLabel("Вторая таблица").selectOption({ label: "stock" });
  await page.getByRole("button", { name: "Создать таблицу" }).click();
  await expect(page.getByRole("button", { name: "stock · 1" })).toHaveText("7");
  await page.setViewportSize({ width: 320, height: 650 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
