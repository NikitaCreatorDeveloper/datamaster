import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
const root = path.resolve("dist");
const archive = new JSZip();
await readFile(path.join(root, "index.html"));
const files = await readdir(root, { recursive: true, withFileTypes: true });
for (const entry of files) {
  if (!entry.isFile()) continue;
  const full = path.join(entry.parentPath, entry.name);
  archive.file(
    path.relative(root, full).split(path.sep).join("/"),
    await readFile(full),
  );
}
await mkdir("release", { recursive: true });
await writeFile(
  "release/DataMaster-Cloudflare-Pages.zip",
  await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
console.log("release/DataMaster-Cloudflare-Pages.zip");
