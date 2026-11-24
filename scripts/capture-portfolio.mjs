/**
 * Capture the production build in a fresh Chromium profile.
 * Requires OpenSSL and FFmpeg with libx264 and libass. See docs/portfolio-v2.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const buildDir = path.join(root, "dist");
const outputDir = path.join(root, "docs", "portfolio-v2");
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const movieViewport = { width: 1600, height: 836 };
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".csv": "text/csv; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function serveBuild(temp) {
  await readFile(path.join(buildDir, "index.html"));
  const headerFile = await readFile(path.join(buildDir, "_headers"), "utf8");
  const policy = headerFile.match(/^\s*Content-Security-Policy:\s*(.+)$/im)?.[1];
  if (!policy) throw new Error("The production CSP is missing.");
  const key = path.join(temp, "key.pem");
  const cert = path.join(temp, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", key, "-out", cert, "-subj", "/CN=localhost",
  ], { stdio: "ignore" });
  const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "https://localhost").pathname);
      const file = path.resolve(buildDir, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(buildDir + path.sep) || !["GET", "HEAD"].includes(req.method)) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Security-Policy": policy,
        "Content-Type": contentTypes[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { origin: "https://127.0.0.1:" + server.address().port,
    stop: () => new Promise((resolve) => server.close(resolve)) };
}

async function isolatedPage(browser, origin, viewport = desktop) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, locale: "ru-RU", colorScheme: "light",
    ignoreHTTPSErrors: true, timezoneId: "Europe/Moscow",
  });
  context.setDefaultTimeout(8000);
  await context.route(/^https?:\/\//, async route => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return {
    page,
    close: async () => {
      await context.close();
      if (errors.length) throw new Error(errors.join("\n"));
    },
  };
}

const button = (page, name, exact = true) => page.getByRole("button", { name, exact });
const nav = (page, name) => page.locator(".sidebar").getByRole("button", { name });

async function launchSample(page, id) {
  const card = page.locator('[data-sample="' + id + '"]');
  if (!(await card.count())) await button(page, "Все 8 шаблонов").click();
  await card.click();
}

async function capture(page, dir, name, fullPage = false) {
  const closeNotice = page.locator(".toast button");
  if (await closeNotice.isVisible()) await closeNotice.click();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(dir, name + ".png"), fullPage, animations: "disabled" });
}

function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  return Math.floor(cs / 360000) + ":" + String(Math.floor(cs / 6000) % 60).padStart(2, "0") +
    ":" + String(Math.floor(cs / 100) % 60).padStart(2, "0") + "." + String(cs % 100).padStart(2, "0");
}

// Capture the browser compositor, retaining real pauses between painted frames.
async function record(page, temp, videoPath, walkthrough) {
  const framesDir = path.join(temp, "frames");
  await mkdir(framesDir);
  const client = await page.context().newCDPSession(page);
  const frames = [];
  const captions = [];
  const writes = [];
  const start = performance.now();
  const elapsed = () => (performance.now() - start) / 1000;
  client.on("Page.screencastFrame", ({ data, sessionId }) => {
    const name = "frame-" + String(frames.length).padStart(5, "0") + ".jpg";
    frames.push({ name, time: elapsed() });
    writes.push(writeFile(path.join(framesDir, name), Buffer.from(data, "base64")));
    client.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await client.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  try {
    await walkthrough(text => captions.push({ text, time: elapsed() }));
  } finally {
    await client.send("Page.stopScreencast");
    await client.detach();
  }
  const stop = elapsed();
  await Promise.all(writes);
  if (frames.length < 8) throw new Error("Insufficient compositor frames for a screen recording.");
  const t0 = frames[0].time;
  const fps = 25;
  const frameCount = Math.ceil((stop - t0) * fps);
  let sourceIndex = 0;
  // Sample the latest painted frame at each 40 ms tick. This keeps the
  // recording and its subtitles on the same clock, including static screens.
  for (let tick = 0; tick < frameCount; tick++) {
    const time = t0 + tick / fps;
    while (sourceIndex + 1 < frames.length && frames[sourceIndex + 1].time <= time) sourceIndex++;
    const renderedName = "tick-" + String(tick).padStart(5, "0") + ".jpg";
    await link(path.join(framesDir, frames[sourceIndex].name), path.join(framesDir, renderedName));
  }
  const { width, height: viewHeight } = page.viewportSize();
  const height = viewHeight + 64;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Label,DejaVu Sans,23,&H00F7F7F7,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,32,32,18,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const subtitles = captions.map((item, i) =>
    "Dialogue: 0," + assTime(item.time - t0) + "," +
    assTime((captions[i + 1]?.time ?? stop) - t0) + ",Label,,0,0,0,," + item.text);
  await writeFile(path.join(framesDir, "captions.ass"), [header, ...subtitles].join("\n"));
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-framerate", String(fps), "-i", "tick-%05d.jpg",
    "-vf", `scale=in_range=full:out_range=limited,format=yuv420p,setsar=1,pad=${width}:${height}:0:0:color=0x25233a,ass=captions.ass`,
    "-an", "-c:v", "libx264", "-color_range", "tv", "-threads", "2", "-preset", "medium", "-crf", "19", "-movflags", "+faststart",
    videoPath,
  ], { cwd: framesDir });
}

async function recordDemo(page, dir, file) {
  await record(page, dir, file, async caption => {
    caption("DataMaster 2.0. Рассчитаем цены в браузере и проверим выгрузку.");
    await pause(2600);
    await launchSample(page, "shop");
    await page.getByRole("heading", { name: "Коллекция · розничный прайс" }).waitFor();
    caption("Шаблон добавил 45% к себестоимости. Исходный лист сохранён рядом.");
    await pause(3300);

    const search = page.getByRole("textbox", { name: "Поиск в таблице" });
    const mug = page.locator("tbody tr").filter({ hasText: "FM-101" });
    const cost = mug.getByRole("button", { name: /^Себестоимость ·/ });
    const retail = mug.getByRole("button", { name: /^Розничная цена ·/ });
    caption("Найдём кружку FM-101. Закупка 465 ₽, розничная цена с наценкой 45% — 674,25 ₽.");
    await search.pressSequentially("FM-101", { delay: 200 });
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(cost).toHaveText("465");
    await expect(retail).toHaveText(/674[.,]25/);
    await pause(2300);

    const reference = await cost.locator("..").getAttribute("data-cell");
    if (!reference) throw new Error("Missing cell address for FM-101.");
    const formula = "=ROUND(" + reference + "*1.45,2)";
    caption("Свяжем розничную цену с себестоимостью формулой с округлением.");
    await retail.click();
    const cell = page.getByRole("textbox", { name: "Значение ячейки" });
    await cell.fill("");
    await cell.pressSequentially(formula, { delay: 110 });
    await pause(900);
    await cell.press("Enter");
    await expect(page.getByRole("textbox", { name: "Строка формул" })).toHaveValue(formula);
    await pause(1900);
    caption("Поставщик поднял цену до 500 ₽. Розничная цена автоматически станет 725 ₽.");
    await cost.click();
    await cell.fill("");
    await cell.pressSequentially("500", { delay: 230 });
    await cell.press("Enter");
    await expect(retail).toHaveText("725");
    await pause(2700);
    await search.fill("");
    caption("Снимаем поисковый фильтр и выгружаем рассчитанный прайс.");
    await button(page, "Экспорт").click();
    await button(page, "XLSX").click();
    await pause(2300);
    const download = page.waitForEvent("download");
    await button(page, "Скачать файл").click();
    const exported = await download;
    await exported.saveAs(path.join(dir, "Новый прайс.xlsx"));
    caption("Проверяем скачанный XLSX повторным импортом.");
    await pause(1500);
    await nav(page, /^Импорт файлов$/).click();
    await page.getByRole("dialog").waitFor();
    await pause(1700);
    await page.getByTestId("file-input").setInputFiles(path.join(dir, "Новый прайс.xlsx"));
    await page.getByRole("heading", { name: "Новый прайс" }).waitFor();
    await search.pressSequentially("FM-101", { delay: 170 });
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(cost).toHaveText("500");
    await expect(retail).toHaveText("725");
    caption("В скачанном файле найдена та же позиция. Себестоимость 500 ₽, розничная цена 725 ₽.");
    await pause(3000);

    await nav(page, /^Обзор/).click();
    caption("Откроем второй пример. Панель аналитики сравнивает продажи по месяцам.");
    await launchSample(page, "sales");
    await page.getByRole("heading", { name: /^Аналитика$/ }).waitFor();
    await page.getByRole("combobox", { name: "Разбивка" }).selectOption({ label: "Канал" });
    await page.getByRole("img", { name: "Диаграмма отчёта" }).waitFor();
    await pause(1700);
    caption("Выручка и расходы рассчитаны из выбранных строк. Меняем вид диаграммы.");
    await button(page, "Линия").click();
    await page.getByRole("img", { name: "Диаграмма отчёта" }).waitFor();
    await pause(3400);
  });
}

async function collectScreens(browser, origin, dir) {
  const { page, close } = await isolatedPage(browser, origin);
  try {
    await capture(page, dir, "01-workspace");
    await nav(page, /^Сценарии/).click();
    await capture(page, dir, "02-scenarios");
    await nav(page, /^Обзор/).click();
    await launchSample(page, "shop");
    await page.getByRole("heading", { name: "Коллекция · розничный прайс" }).waitFor();
    await button(page, "Розничная цена · 1").click();
    const cell = page.getByRole("textbox", { name: "Значение ячейки" });
    await cell.fill("=ROUND(D2*1.45,2)");
    await cell.press("Enter");
    await page.getByLabel("Тип данных").selectOption("currency");
    await button(page, "Жирный").click();
    await expect(page.getByRole("textbox", { name: "Строка формул" })).toHaveValue("=ROUND(D2*1.45,2)");
    await capture(page, dir, "03-price-editor");
    await button(page, "Условное форматирование").click();
    await page.getByRole("combobox", { name: "Правило" }).selectOption("greater");
    await page.getByRole("spinbutton", { name: "Значение" }).fill("1000");
    await capture(page, dir, "04-formatting");
    await page.keyboard.press("Escape");

    await nav(page, /^Обзор/).click();
    await launchSample(page, "sales");
    const reportChart = page.getByRole("img", { name: "Диаграмма отчёта" });
    await page.getByRole("combobox", { name: "Разбивка" }).selectOption({ label: "Канал" });
    await reportChart.waitFor();
    await capture(page, dir, "05-sales-dashboard");
    await button(page, "Сменить тему").click();
    await button(page, "Линия").click();
    await reportChart.waitFor();
    await capture(page, dir, "06-dark-analytics");
    await button(page, "Сменить тему").click();
    await nav(page, /^Обзор/).click();
    await launchSample(page, "finance");
    await page.getByRole("combobox", { name: "Лист отчёта" }).selectOption({ label: "Доходы и затраты по статьям" });
    await page.getByRole("combobox", { name: "Группировка" }).selectOption({ label: "Категория" });
    await page.getByRole("combobox", { name: "Показатель" }).selectOption({ label: "Расходы" });
    await button(page, "Круг").click();
    await reportChart.waitFor();
    await button(page, "Сохранить панель").click();
    await page.getByRole("textbox", { name: "Название панели" }).fill("Структура расходов");
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
    await reportChart.waitFor();
    await capture(page, dir, "07-financial-report");
    await nav(page, /API Studio/).click();
    await button(page, "Пример запроса").click();
    await button(page, "Сохранить шаблон").click();
    await page.getByRole("textbox", { name: "Название шаблона" }).fill("Доставки мастерской");
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("textbox", { name: "Название листа API" }).fill("Реестр отправлений");
    await button(page, "Отправить").click();
    await expect(page.getByText(/HTTP 200/)).toBeVisible();
    await expect(page.getByText("TR-1051", { exact: true })).toBeVisible();
    await capture(page, dir, "08-api-studio", true);

    await nav(page, /^Конструктор/).click();
    await page.getByRole("textbox", { name: "Название сценария" }).fill("Оплаченные заказы по дням");
    await page.getByRole("combobox", { name: "Лист-источник" }).selectOption({ label: "Отчёт по продажам" });
    await page.getByRole("combobox", { name: "Тип шага" }).selectOption("filter");
    await page.getByRole("combobox", { name: "Исходный столбец" }).selectOption({ label: "Статус" });
    await page.getByRole("combobox", { name: "Условие" }).selectOption("equal");
    await page.getByRole("textbox", { name: "Значение", exact: true }).fill("Оплачен");
    const addStep = page.getByRole("combobox", { name: "Добавить шаг" });
    await addStep.selectOption("pivot");
    await page.getByRole("combobox", { name: "Исходный столбец" }).selectOption({ label: "Дата" });
    await page.getByRole("combobox", { name: "Второй столбец" }).selectOption({ label: "Сумма" });
    await addStep.selectOption("export");
    await page.getByRole("combobox", { name: "Формат" }).selectOption("XLSX");
    await button(page, "Сохранить").click();
    await button(page, "Выполнить сценарий").click();
    await expect(button(page, "Применить результат")).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, dir, "09-automation", true);
    await nav(page, /^Качество данных/).click();
    await page.getByRole("combobox", { name: "Проверяемый лист" }).selectOption({ label: "Клиентская база" });
    await page.getByRole("heading", { name: "Строки для проверки" }).waitFor();
    await capture(page, dir, "13-data-quality");
    await nav(page, /^Проекты/).click();
    await button(page, "Создать проект").click();
    await page.getByRole("textbox", { name: "Название проекта" }).fill("Закупки мастерской");
    await page.getByRole("dialog").getByRole("button", { name: "Создать", exact: true }).click();
    await nav(page, /^Обзор/).click();
    await launchSample(page, "suppliers");
    await page.getByRole("heading", { name: "Закупки · сопоставление цен" }).waitFor();
    await nav(page, /^Проекты/).click();
    await button(page, "Разрешить сохранение").click();
    await page.getByRole("dialog").getByRole("button", { name: "Разрешить", exact: true }).click();
    await expect(button(page, "Отключить")).toBeVisible();
    await capture(page, dir, "10-projects");
  } finally {
    await close();
  }

  const english = await isolatedPage(browser, origin);
  try {
    await english.page.getByTitle("Switch to English").click();
    await launchSample(english.page, "shop");
    await english.page.getByRole("heading", { name: "Collection · retail prices" }).waitFor();
    await nav(english.page, /^Overview/).click();
    await capture(english.page, dir, "11-english");
  } finally {
    await english.close();
  }

  const register = await isolatedPage(browser, origin);
  try {
    await launchSample(register.page, "batch");
    await register.page.getByRole("heading", { name: "Накладные · сводный реестр" }).waitFor();
    await expect(register.page.locator("tbody tr")).toHaveCount(6);
    await expect(register.page.getByText("00123", { exact: true })).toHaveCount(1);
    await expect(register.page.getByText("00121", { exact: true })).toBeVisible();
    await capture(register.page, dir, "14-consolidated-invoices");
  } finally {
    await register.close();
  }

  const phone = await isolatedPage(browser, origin, mobile);
  try {
    await capture(phone.page, dir, "12-mobile");
  } finally {
    await phone.close();
  }
}

async function main() {
  const captureDir = await mkdtemp(path.join(tmpdir(), "dm-portfolio-"));
  let server, browser;
  try {
    server = await serveBuild(captureDir);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
    const assetDir = path.join(captureDir, "assets");
    await mkdir(assetDir);
    await collectScreens(browser, server.origin, assetDir);
    const movie = await isolatedPage(browser, server.origin, movieViewport);
    try {
      await recordDemo(movie.page, captureDir, path.join(assetDir, "DataMaster-Studio-2.mp4"));
    } finally {
      await movie.close();
    }
    const { readdir } = await import("node:fs/promises");
    await mkdir(path.join(outputDir, "screenshots"), { recursive: true });
    for (const file of await readdir(assetDir)) {
      const folder = file.endsWith(".png") ? path.join(outputDir, "screenshots") : outputDir;
      await copyFile(path.join(assetDir, file), path.join(folder, file));
    }
  } finally {
    await browser?.close();
    await server?.stop();
    await rm(captureDir, { recursive: true, force: true });
  }
}

await main();
