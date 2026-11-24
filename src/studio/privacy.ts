// Authentication material may be echoed by an API. Only the response preview keeps raw JSON.
export const secretKey =
  /token|passw|authorization|cookie|credential|secret|api.?key|private.?key|signature/i;
export function scrubResponse(
  value: unknown,
  secrets: readonly string[],
  depth = 0,
): unknown {
  if (depth > 32) throw Error("jsonDepth");
  if (
    typeof value === "string" &&
    secrets.some((secret) => secret && value.includes(secret))
  )
    return "[redacted]";
  if (Array.isArray(value))
    return value.map((item) => scrubResponse(item, secrets, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !secretKey.test(key) &&
            !secrets.some((secret) => secret && key.includes(secret)),
        )
        .map(([key, item]) => [key, scrubResponse(item, secrets, depth + 1)]),
    );
  return value;
}
