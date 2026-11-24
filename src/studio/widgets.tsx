import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
} from "react";
import { type Grid, str } from "../core";
import type { T } from "../ui";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {Children.map(children, (child) =>
        isValidElement<{ "aria-labelledby"?: string }>(child) &&
        typeof child.type === "string" &&
        ["select", "input", "textarea"].includes(child.type)
          ? cloneElement(child, { "aria-labelledby": labelId })
          : child,
      )}
    </label>
  );
}
export function Choice({
  label,
  value,
  options,
  change,
  blank,
}: {
  label: string;
  value: string;
  options: string[];
  change: (v: string) => void;
  blank?: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => change(e.target.value)}>
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function PreviewGrid({
  g,
  t,
  max = 12,
}: {
  g: Grid;
  t: T;
  max?: number;
}) {
  return (
    <div className="previewgrid">
      <div className="previewscroll">
        <table>
          <thead>
            <tr>
              {g.cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.slice(0, max).map((r, i) => (
              <tr key={i}>
                {g.cols.map((c, j) => (
                  <td key={c}>{str(r[j])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>
        {t("Показано строк", "Rows shown")} {Math.min(g.rows.length, max)} /{" "}
        {g.rows.length.toLocaleString(t("ru", "en"))}
      </small>
    </div>
  );
}
