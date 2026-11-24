import { useEffect, useState } from "react";
import { ScanSearch, Download, CheckCheck } from "lucide-react";
import { type Table } from "../core";
import { errorText, ErrorBox, type T } from "../ui";
import { PreviewGrid, Field } from "./widgets";
import { quality } from "./process";
import { background } from "./worker";
import { saveBlob } from "./download";
export function Quality({
  tables,
  id,
  t,
  display,
}: {
  tables: Table[];
  id: string;
  t: T;
  display: (a: Table) => string;
}) {
  const [selected, S] = useState(id),
    [report, Q] = useState<ReturnType<typeof quality> | null>(null),
    [error, E] = useState("");
  const a = tables.find((s) => s.id === selected) ?? tables[0];
  useEffect(() => {
    const ac = new AbortController();
    Q(null);
    E("");
    background<ReturnType<typeof quality>>(
      { op: "quality", grid: { cols: a.cols, rows: a.rows } },
      ac.signal,
    )
      .then((q) => {
        if (!ac.signal.aborted) Q(q);
      })
      .catch((e) => {
        if (!ac.signal.aborted) E(errorText(e, t));
      });
    return () => ac.abort();
  }, [a]);
  const labels: Record<string, string> = {
    empty: t("Пустая ячейка", "Empty cell"),
    duplicate: t("Повтор строки", "Duplicate row"),
    email: "Email",
    phone: t("Телефон", "Phone"),
    date: t("Дата", "Date"),
  };
  const issues = {
    cols: [
      t("Строка Excel", "Excel row"),
      t("Столбец", "Column"),
      t("Проблема", "Issue"),
      t("Значение", "Value"),
    ],
    rows:
      report?.examples.map((e) => [
        e.row,
        e.column,
        labels[e.issue],
        e.value,
      ]) ?? [],
  };
  return (
    <>
      <div className="pagetitle">
        <div>
          <h1>{t("Качество данных", "Data quality")}</h1>
          <p>
            {t(
              "Пустые значения, повторы и проверка форматов",
              "Missing values, duplicate rows and format checks",
            )}
          </p>
        </div>
        <button
          className="btn"
          disabled={!report}
          onClick={async () => {
            try {
              saveBlob(
                await background<Blob>({
                  op: "encode",
                  grid: issues,
                  format: "CSV",
                }),
                display(a) + "-quality.csv",
              );
            } catch (e) {
              E(errorText(e, t));
            }
          }}
        >
          <Download size={15} />
          CSV
        </button>
      </div>
      <div className="panel studio-panel">
        <Field label={t("Проверяемый лист", "Sheet to inspect")}>
          <select value={a.id} onChange={(e) => S(e.target.value)}>
            {tables.map((s) => (
              <option value={s.id} key={s.id}>
                {display(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBox message={error} />
      {report ? (
        <>
          <div className="analytics-kpis topgap">
            {[
              [t("Проверено строк", "Rows checked"), report.rows],
              [t("Дубли строк", "Duplicate rows"), report.duplicates],
              [t("Пустые ячейки", "Empty cells"), report.blanks],
              [t("Ошибки формата", "Format issues"), report.invalid],
            ].map(([k, v]) => (
              <div className="panel kpi" key={k}>
                <div>{k}</div>
                <b>{Number(v).toLocaleString(t("ru", "en"))}</b>
              </div>
            ))}
          </div>
          <div className="panel studio-panel">
            <h2>{t("Профиль столбцов", "Column profile")}</h2>
            <PreviewGrid
              t={t}
              max={300}
              g={{
                cols: [
                  t("Столбец", "Column"),
                  t("Уникальные", "Distinct"),
                  t("Пустые", "Blank"),
                  t("Ошибки", "Invalid"),
                ],
                rows: report.fields.map((f) => [
                  f.col,
                  f.distinct,
                  f.empty,
                  f.invalid,
                ]),
              }}
            />
          </div>
          <div className="panel studio-panel topgap">
            <h2>{t("Строки для проверки", "Rows to review")}</h2>
            {issues.rows.length ? (
              <>
                <p className="hint">
                  {t(
                    "Детализация первых 500 замечаний. Счётчики включают весь лист.",
                    "First 500 findings. Counts cover the entire sheet.",
                  )}
                </p>
                <PreviewGrid t={t} g={issues} max={500} />
              </>
            ) : (
              <div className="emptywell">
                <CheckCheck />
                {t("Проверки пройдены", "Checks passed")}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="emptywell">
          <ScanSearch />
          {t("Проверяем лист…", "Inspecting the sheet…")}
        </div>
      )}
    </>
  );
}
