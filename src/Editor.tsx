import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  Workflow,
  GitMerge,
  Trash2,
  Undo2,
  Pencil,
} from "lucide-react";
import { type Table, type Cell, str, validGrid } from "./core";
import { type DContext } from "./Dashboard";
import { FormatIcon, errorText } from "./ui";
export function Editor({
  a,
  ctx,
  modify,
  undo,
  canUndo,
  notify,
}: {
  a: Table;
  ctx: DContext;
  modify: (n: Table, ru: string, en: string) => void;
  undo: () => void;
  canUndo: boolean;
  notify: (s: string) => void;
}) {
  const { t, display, act } = ctx,
    [page, setPage] = useState(0),
    [q, setQuery] = useState(""),
    [edit, setEditingCell] = useState<[number, number] | null>(null),
    [draft, setDraft] = useState(""),
    [per, setPageSize] = useState(20);
  const ids = useMemo(
    () =>
      a.rows
        .map((_, i) => i)
        .filter(
          (i) =>
            !q ||
            a.rows[i].some((v) =>
              str(v).toLowerCase().includes(q.toLowerCase()),
            ),
        ),
    [a.rows, q],
  );
  const pages = Math.max(1, Math.ceil(ids.length / per)),
    pg = Math.min(page, pages - 1);
  useEffect(() => {
    setEditingCell(null);
  }, [a]);
  function cellSave() {
    if (!edit) return;
    const [r, c] = edit;
    setEditingCell(null);
    if (str(a.rows[r][c]) === draft) return;
    const old = a.rows[r][c],
      val =
        typeof old === "number" &&
        draft.trim() &&
        Number.isFinite(Number(draft))
          ? Number(draft)
          : typeof old === "boolean" && /^(true|false)$/.test(draft)
            ? draft === "true"
            : draft;
    modify(
      {
        ...a,
        steps: [],
        rows: a.rows.map((row, i) =>
          i === r ? row.map((v, j) => (j === c ? val : v)) : row,
        ),
      },
      "Изменена ячейка",
      "Edited cell",
    );
  }
  return (
    <>
      <div className="pagetitle editor-title">
        <div className="titlewithicon">
          <FormatIcon format={a.format} />
          <div>
            <h1>{display(a)}</h1>
            <p>
              {a.format} · {t("Строк", "Rows")} {a.rows.length.toLocaleString()}{" "}
              · {t("Столбцов", "Columns")} {a.cols.length}
            </p>
          </div>
        </div>
        <button className="btn primary" onClick={() => act("export", a.id)}>
          <Download size={16} />
          {t("Экспорт", "Export")}
        </button>
      </div>
      <div className="editorbar">
        <button className="btn" onClick={() => act("price", a.id)}>
          <SlidersHorizontal size={16} />
          {t("Операции", "Operations")}
        </button>
        <button className="btn" onClick={() => act("merge", a.id)}>
          <GitMerge size={16} />
          {t("Объединить / сравнить", "Merge / compare")}
        </button>
        <button
          className="btn"
          disabled={!a.steps.length}
          onClick={() => act("saveRecipe", a.id)}
        >
          <Workflow size={16} />
          {t("Сохранить сценарий", "Save scenario")}
          {a.steps.length > 0 && (
            <span className="count">{a.steps.length}</span>
          )}
        </button>
        <button className="btn" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
          {t("Отменить", "Undo")}
        </button>
      </div>
      <div className="panel sheetpanel">
        <div className="sheettools">
          <div className="searchbox">
            <Search size={16} />
            <input
              aria-label={t("Поиск в таблице", "Search in table")}
              placeholder={t("Поиск в таблице…", "Search in table…")}
              value={q}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <button
            className="btn compact"
            onClick={() => {
              const rows = [...a.rows, a.cols.map(() => null as Cell)];
              try {
                validGrid({ ...a, rows });
                modify(
                  { ...a, steps: [], rows },
                  "Добавлена строка",
                  "Added row",
                );
                setQuery("");
                setPage(Math.floor((rows.length - 1) / per));
              } catch (e) {
                notify(errorText(e, t));
              }
            }}
          >
            <Plus size={15} />
            {t("Строка", "Row")}
          </button>
        </div>
        <div className="sheet-scroll">
          <table className="sheet">
            <thead>
              <tr>
                <th>#</th>
                {a.cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th aria-label={t("Действия", "Actions")} />
              </tr>
            </thead>
            <tbody>
              {ids.slice(pg * per, (pg + 1) * per).map((r) => (
                <tr key={r}>
                  <td>{r + 1}</td>
                  {a.cols.map((c, j) => (
                    <td key={c}>
                      {edit?.[0] === r && edit[1] === j ? (
                        <input
                          aria-label={t("Значение ячейки", "Cell value")}
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={cellSave}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              cellSave();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingCell(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          aria-label={c + " · " + (r + 1)}
                          title={str(a.rows[r][j])}
                          onClick={() => {
                            setEditingCell([r, j]);
                            setDraft(str(a.rows[r][j]));
                          }}
                        >
                          {str(a.rows[r][j]) || " "}
                        </button>
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      className="remove-row"
                      aria-label={t("Удалить строку ", "Delete row ") + (r + 1)}
                      onClick={() =>
                        modify(
                          {
                            ...a,
                            steps: [],
                            rows: a.rows.filter((_, i) => i !== r),
                          },
                          "Удалена строка",
                          "Deleted row",
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ids.length && (
            <div className="empty">
              {t("Строки не найдены", "No matching rows")}
            </div>
          )}
        </div>
        <div className="pagination">
          <small>
            {ids.length ? pg * per + 1 : 0}–
            {Math.min((pg + 1) * per, ids.length)} {t("из", "of")} {ids.length}
          </small>
          <div>
            <select
              aria-label={t("Строк на странице", "Rows per page")}
              value={per}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[20, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <button
              className="iconbtn"
              disabled={!pg}
              onClick={() => setPage(pg - 1)}
              aria-label={t("Предыдущая страница", "Previous page")}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {pg + 1} / {pages}
            </span>
            <button
              className="iconbtn"
              disabled={pg >= pages - 1}
              onClick={() => setPage(pg + 1)}
              aria-label={t("Следующая страница", "Next page")}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <p className="editorhint">
        <Pencil size={14} />
        {t(
          "Нажмите на ячейку для редактирования. Enter — сохранить, Esc — отменить.",
          "Click a cell to edit it. Enter saves, Esc cancels.",
        )}
      </p>
    </>
  );
}
