import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const origin = "https://datamaster.test";
export async function start(
  page: Page,
  appOrigin = origin,
  heading = "Рабочее пространство",
) {
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
  await page.getByRole("heading", { name: heading }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
export async function importFile(page: Page, name: string, body: Buffer) {
  await page
    .getByRole("button", { name: "Импорт файлов", exact: true })
    .click();
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: body,
  });
  await expect(
    page.getByRole("heading", { name: name.replace(/\.[^.]+$/, "") }),
  ).toBeVisible();
}
