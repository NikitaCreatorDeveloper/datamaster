import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Modal, type T } from "../ui";
import { Field, Choice } from "./widgets";
import type { Table } from "../core";
import type { Rule } from "./model";
export function ViewSettings({
  a,
  r,
  c,
  t,
  close,
  apply,
}: {
  a: Table;
  r: number;
  c: number;
  t: T;
  close: () => void;
  apply: (t: Table) => void;
}) {
  const [width, W] = useState(a.meta?.widths?.[c] ?? 145),
    [height, H] = useState(a.meta?.heights?.[r] ?? 34),
    [fr, FR] = useState(a.meta?.frozenRows ?? 0),
    [fc, FC] = useState(a.meta?.frozenCols ?? 0);
  const props = (
    v: number,
    set: (n: number) => void,
    min: number,
    max: number,
  ) => ({
    type: "number",
    required: true,
    min,
    max,
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(Number(e.target.value)),
  });
  return (
    <Modal title={t("Размеры и закрепление", "Size and freeze")} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({
            ...a,
            meta: {
              ...a.meta,
              widths: { ...a.meta?.widths, [c]: width },
              heights: { ...a.meta?.heights, [r]: height },
              frozenRows: fr,
              frozenCols: fc,
            },
          });
          close();
        }}
      >
        <div className="formgrid">
          <Field label={t("Ширина столбца, px", "Column width, px")}>
            <input {...props(width, W, 55, 520)} />
          </Field>
          <Field label={t("Высота строки, px", "Row height, px")}>
            <input {...props(height, H, 24, 180)} />
          </Field>
          <Field label={t("Закрепить верхние строки", "Freeze top rows")}>
            <input {...props(fr, FR, 0, Math.min(10, a.rows.length))} />
          </Field>
          <Field label={t("Закрепить левые столбцы", "Freeze left columns")}>
            <input {...props(fc, FC, 0, Math.min(8, a.cols.length))} />
          </Field>
        </div>
        <div className="modalfoot">
          <button className="btn primary">
            <Check size={16} />
            {t("Применить", "Apply")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RuleDialog({
  a,
  c,
  t,
  close,
  apply,
}: {
  a: Table;
  c: number;
  t: T;
  close: () => void;
  apply: (t: Table) => void;
}) {
  const [col, C] = useState(a.cols[c]),
    [kind, K] = useState<Rule["kind"]>("duplicate"),
    [value, V] = useState(""),
    [color, Color] = useState("#fde6a4");
  const labels = {
    duplicate: t("Повторяющиеся значения", "Duplicate values"),
    empty: t("Пустые ячейки", "Empty cells"),
    equal: t("Равно", "Equal to"),
    greater: t("Больше", "Greater than"),
  };
  return (
    <Modal
      title={t("Условное форматирование", "Conditional formatting")}
      close={close}
    >
      <Choice
        label={t("Столбец", "Column")}
        options={a.cols}
        value={col}
        change={C}
      />
      <Field label={t("Правило", "Rule")}>
        <select value={kind} onChange={(e) => K(e.target.value as typeof kind)}>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {["equal", "greater"].includes(kind) && (
        <Field label={t("Значение", "Value")}>
          <input
            value={value}
            onChange={(e) => V(e.target.value)}
            type={kind === "greater" ? "number" : "text"}
          />
        </Field>
      )}
      <Field label={t("Цвет подсветки", "Highlight color")}>
        <input
          type="color"
          value={color}
          onChange={(e) => Color(e.target.value)}
        />
      </Field>
      {(a.meta?.rules ?? []).map((rule, i) => (
        <div key={i} className="ruleline">
          <i style={{ background: rule.color }} />
          {rule.col} · {labels[rule.kind]}
          <button
            className="iconbtn"
            aria-label={t("Удалить правило", "Remove rule")}
            onClick={() =>
              apply({
                ...a,
                meta: {
                  ...a.meta,
                  rules: a.meta!.rules!.filter((_, n) => n !== i),
                },
              })
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="modalfoot">
        <button
          disabled={kind === "greater" && !value.trim()}
          className="btn primary"
          onClick={() => {
            apply({
              ...a,
              meta: {
                ...a.meta,
                rules: [...(a.meta?.rules ?? []), { col, kind, color, value }],
              },
            });
            close();
          }}
        >
          {t("Добавить правило", "Add rule")}
        </button>
      </div>
    </Modal>
  );
}
