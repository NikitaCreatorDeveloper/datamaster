import { test, expect } from "@playwright/test";
import { createServer } from "node:https";
import type { Server } from "node:https";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
async function listen(server: Server) {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return "https://127.0.0.1:" + (server.address() as { port: number }).port;
}
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
test("REST Studio sends real cross-origin HTTPS methods, preflight, manual and periodic GET, safe templates and CORS errors", async ({
  browser,
}) => {
  test.setTimeout(100000);
  const dir = await mkdtemp(path.join(tmpdir(), "dm-studio-https-")),
    key = path.join(dir, "key.pem"),
    cert = path.join(dir, "cert.pem");
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true }),
    servers: Server[] = [];
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
    const tls = { key: await readFile(key), cert: await readFile(cert) },
      policy = (await readFile("dist/_headers", "utf8")).match(
        /^\s*Content-Security-Policy:\s*(.+)$/m,
      )![1];
    const app = createServer(tls, async (req, res) => {
      try {
        const hostPath = new URL(req.url!, "https://localhost").pathname,
          file = hostPath === "/" ? "index.html" : hostPath.slice(1);
        const bytes = await readFile(path.join("dist", file));
        res
          .writeHead(200, {
            "Content-Security-Policy": policy,
            "Content-Type":
              mime[path.extname(file)] ?? "application/octet-stream",
          })
          .end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
    servers.push(app);
    const origin = await listen(app),
      token = "volatile-DM-fixture",
      calls: { verb: string; url: URL; body: string }[] = [],
      preflights: string[] = [];
    let round = 0;
    const api = createServer(tls, async (req, res) => {
      const url = new URL(req.url!, "https://localhost");
      if (url.pathname === "/deny") {
        res.end("[]");
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Team",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
      if (req.method === "OPTIONS") {
        preflights.push(req.headers["access-control-request-method"] as string);
        res.writeHead(204).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      calls.push({ verb: req.method!, url, body });
      res.setHeader("Content-Type", "application/json");
      if (
        req.headers.authorization !== "Bearer " + token ||
        req.headers["x-team"] !== "Demo" ||
        req.headers.cookie ||
        req.headers.referer
      ) {
        res.writeHead(403).end("{}");
        return;
      }
      if (req.method === "DELETE") {
        res.writeHead(204).end();
        return;
      }
      const page = Number(url.searchParams.get("page") ?? 1);
      if (req.method === "GET" && page === 1) round++;
      res.end(
        JSON.stringify({
          data: {
            items:
              page > 2
                ? []
                : [
                    {
                      id: page,
                      stock: round * 10 + page,
                      customer: { city: "Тула" },
                      token,
                      sampleEcho: token,
                    },
                  ],
          },
        }),
      );
    });
    servers.push(api);
    const endpoint = await listen(api);
    const page = await ctx.newPage();
    await page.goto(origin);
    const btn = (name: string) =>
      page.getByRole("button", { name, exact: true });
    await page
      .locator("nav")
      .getByRole("button", { name: "API Studio" })
      .click();
    await page.getByLabel("Адрес запроса").fill(endpoint + "/deny");
    await btn("Отправить").click();
    await expect(page.getByRole("alert")).toContainText("CORS");
    await page
      .getByLabel("Адрес запроса")
      .fill(endpoint + "/api/items?signature=fixture-query");
    await page.getByLabel("Параметры URL").fill('{"market":"east"}');
    await btn("Заголовки").click();
    await page.getByLabel("HTTP-заголовки").fill('{"X-Team":"Demo"}');
    await btn("Доступ").click();
    await page.getByLabel("Авторизация").selectOption("bearer");
    await page.getByLabel("Токен или пароль").fill(token);
    await page.getByLabel("Путь к записям JSON").fill("data.items");
    await btn("Страницы").click();
    await page.getByLabel("Пагинация GET").selectOption("page");
    await page.getByLabel("Максимум страниц").fill("4");
    await btn("Отправить").click();
    await expect(page.locator(".httpstatus")).toContainText("3 стр.");
    await expect(
      page.getByRole("cell", { name: "[redacted]", exact: true }),
    ).toHaveCount(2);
    await page.getByLabel("Название листа API").fill("Поставки");
    await btn("В таблицу").click();
    await page.getByLabel("Интервал, сек.").fill("15");
    await btn("Автообновление").click();
    await expect.poll(() => round, { timeout: 22000 }).toBeGreaterThan(1);
    await expect(
      page.getByRole("cell", { name: "21", exact: true }),
    ).toBeVisible();
    await btn("Остановить обновление").click();
    await btn("Отправить").click();
    await expect(
      page.getByRole("cell", { name: "31", exact: true }),
    ).toBeVisible();
    await btn("Обновить лист").click();
    await btn("Сохранить шаблон").click();
    await page.getByLabel("Название шаблона").fill("Поставщик");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    const saved = await page.evaluate(() =>
      JSON.stringify([localStorage, sessionStorage]),
    );
    for (const secret of [token, "fixture-query", "east", '"Demo"'])
      expect(saved).not.toContain(secret);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      await page.getByLabel("Метод", { exact: true }).selectOption(method);
      await btn("Тело").click();
      await page.getByLabel("Тело запроса").fill('{"qty":12}');
      const count = calls.length;
      await btn("Отправить").click();
      await expect(page.getByRole("dialog")).toContainText(method);
      expect(calls.length).toBe(count);
      await btn("Отмена").click();
      expect(calls.length).toBe(count);
      await btn("Отправить").click();
      await btn("Подтвердить отправку").click();
      await expect(page.locator(".httpstatus")).toContainText(
        "HTTP " + (method === "DELETE" ? 204 : 200),
      );
      expect(calls.at(-1)?.verb).toBe(method);
      expect(JSON.parse(calls.at(-1)!.body)).toEqual({ qty: 12 });
      expect(calls.at(-1)!.url.searchParams.get("market")).toBe("east");
    }
    expect(preflights).toContain("GET");
    expect(preflights).toContain("PATCH");
    await page
      .locator("nav")
      .getByRole("button", { name: /Таблицы/ })
      .click();
    await page.getByText("Поставки", { exact: true }).click();
    await expect(btn("stock · 1")).toHaveText("31");
    await page
      .locator("nav")
      .getByRole("button", { name: "API Studio" })
      .click();
    await page
      .getByRole("button", { name: /Поставщик/ })
      .first()
      .click();
    await btn("Доступ").click();
    await expect(page.getByLabel("Токен или пароль")).toHaveValue("");
  } finally {
    await ctx.close();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    await rm(dir, { recursive: true, force: true });
  }
});
