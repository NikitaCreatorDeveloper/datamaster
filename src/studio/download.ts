export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export const saveJSON = (data: unknown, name: string) =>
  saveBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    name,
  );
export async function readJsonFile(file: File, max = 32 * 1024 * 1024) {
  if (file.size > max) throw Error("size");
  return JSON.parse(await file.text());
}
