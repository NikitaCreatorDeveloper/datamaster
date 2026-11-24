// Produce a second distribution from the same React entry point for local demos.
import { build } from "vite";
import JSZip from "jszip";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const output = await build({
  build: {
    write: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const files = (Array.isArray(output) ? output[0] : output).output;
const js = files
  .find((file) => file.type === "chunk" && file.isEntry)
  .code.replace(/<\/script/gi, "<\\/script");
const css = files.find((file) => file.fileName.endsWith(".css")).source;
const index = files.find((file) => file.fileName === "index.html").source;
const icon = await readFile("public/icon.svg", "base64");
const hash = createHash("sha256").update(js).digest("base64");
const policy =
  "default-src 'none'; script-src 'sha256-" +
  hash +
  "'; style-src 'unsafe-inline'; img-src data:; font-src data:; worker-src blob: data:; connect-src https:; object-src 'none'; base-uri 'none'; form-action 'none'";
const html = String(index)
  .replace(/<script\b[^>]*src=[^>]*><\/script>/, "")
  .replace(
    /<link\b[^>]*rel="stylesheet"[^>]*>/,
    () => "<style>" + css + "</style>",
  )
  .replace('href="/icon.svg"', 'href="data:image/svg+xml;base64,' + icon + '"')
  .replace(
    "<head>",
    '<head><meta name="datamaster-distribution" content="offline"><meta http-equiv="Content-Security-Policy" content="' +
      policy +
      '"><meta name="referrer" content="no-referrer">',
  )
  .replace("</body>", () => "<script>" + js + "</script></body>");
await mkdir("release", { recursive: true });
await writeFile("release/DataMaster.html", html);
const zip = new JSZip();
zip.file("DataMaster.html", html);
await writeFile(
  "release/DataMaster-Offline.zip",
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
console.log("release/DataMaster.html and release/DataMaster-Offline.zip");
