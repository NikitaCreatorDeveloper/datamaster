import { recalculate } from "./studio/formulas";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Papa from "papaparse";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  Workflow,
  GitMerge,
  Undo2,
  Redo2,
  Sheet,
  MoreHorizontal,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Grid2X2,
  PaintBucket,
  Type,
  Highlighter,
  Paintbrush,
  Settings2,
  Pencil,
  Check,
} from "lucide-react";
import { type Table, str } from "./core";
import { type DContext } from "./Dashboard";
import { FormatIcon, errorText, Modal } from "./ui";
import { address, colName } from "./studio/formulas";
import {
  editCells,
  bounds,
  formatted,
  layout,
  applyStyle,
  fillRange,
  ruleChecker,
  type Rect,
} from "./studio/sheets";
import type { CellStyle, CellType } from "./studio/model";
import { ViewSettings, RuleDialog } from "./studio/EditorTools";
import { background } from "./studio/worker";
const point = (r: number, c: number): Rect => ({ r, c, endR: r, endC: c });
export function Editor({
  a,
  ctx,
  modify,
  undo,
  redo,
  canUndo,
  canRedo,
  notify,
}: {
  a: Table;
  ctx: DContext;
  modify: (t: Table, ru: string, en: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  notify: (s: string) => void;
}) {
  const { t, act, display, open, tables } = ctx;
  const [sel, select] = useState<Rect>(point(0, 0)),
    [editing, edit] = useState<{ r: number; c: number } | null>(null),
    [draft, setDraft] = useState(""),
    [bar, setBar] = useState(""),
    [q, Q] = useState(""),
    [page, P] = useState(0),
    [per, Per] = useState(a.rows.length > 1000 ? 0 : 20),
    [dialog, D] = useState(""),
    [bulk, Bulk] = useState(""),
    [context, menu] = useState<{ x: number; y: number } | null>(null),
    [pos, scroll] = useState({ top: 0, h: 460 }),
    [busy, setBusy] = useState(false);
  const scrollEl = useRef<HTMLDivElement>(null),
    searchEl = useRef<HTMLInputElement>(null),
    selection = useRef(sel),
    drag = useRef<"select" | "fill" | null>(null),
    anchor = useRef(sel),
    moved = useRef(false),
    cancelEdit = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const R = Math.min(sel.r, Math.max(0, a.rows.length - 1)),
    C = Math.min(sel.c, a.cols.length - 1),
    range = bounds(sel),
    key = address(R, C),
    style = a.meta?.styles?.[key] ?? {},
    raw = a.meta?.formulas?.[key] ?? str(a.rows[R]?.[C]);
  const setSelection = (v: Rect) => {
    selection.current = v;
    select(v);
  };
  useEffect(() => {
    setBar(raw);
  }, [raw, key]);
  useEffect(() => {
    if (sel.endR >= a.rows.length || sel.endC >= a.cols.length)
      setSelection(point(R, C));
  }, [a.rows.length, a.cols.length]);
  const ids = useMemo(() => {
    const query = q.trim().toLowerCase();
    return a.rows
      .map((_, i) => i)
      .filter(
        (i) =>
          !query || a.rows[i].some((v) => str(v).toLowerCase().includes(query)),
      );
  }, [q, a.rows]);
  const pages = per ? Math.max(1, Math.ceil(ids.length / per)) : 1,
    pg = Math.min(page, pages - 1),
    rowH = (r: number) => a.meta?.heights?.[r] ?? 34,
    widths = a.cols.map((_, c) => a.meta?.widths?.[c] ?? 145);
  const offsets = useMemo(() => {
    const o = [0];
    for (const r of ids) o.push(o.at(-1)! + rowH(r));
    return o;
  }, [ids, a.meta?.heights]);
  const frozenR = Math.min(a.meta?.frozenRows ?? 0, ids.length),
    frozenC = Math.min(a.meta?.frozenCols ?? 0, a.cols.length),
    lefts = [42];
  widths.forEach((w) => lefts.push(lefts.at(-1)! + w));
  const hi = (px: number) => {
    let lo = 0,
      h = ids.length;
    while (lo < h) {
      const m = (lo + h) >>> 1;
      if (offsets[m] < px) lo = m + 1;
      else h = m;
    }
    return lo;
  };
  const first = per ? pg * per : Math.max(frozenR, hi(pos.top) - 4),
    last = per
      ? Math.min(ids.length, first + per)
      : Math.min(ids.length, hi(pos.top + pos.h) + 6);
  const frozenIds = ids.slice(0, Math.min(first, frozenR)),
    visible = ids.slice(first, last),
    checkRule = useMemo(() => ruleChecker(a), [a]);
  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;
    const ob = new ResizeObserver(() =>
      scroll((v) => ({ ...v, h: el.clientHeight })),
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  function change(job: () => Table, ru: string, en: string) {
    try {
      const next = job();
      if (next !== a) modify(next, ru, en);
    } catch (e) {
      notify(errorText(e, t));
    }
    menu(null);
  }
  async function write(edits: { r: number; c: number; value: string }[]) {
    try {
      if (
        a.rows.length * a.cols.length > 40000 ||
        edits.length > 1200 ||
        Object.keys(a.meta?.formulas ?? {}).length > 200
      ) {
        setBusy(true);
        const result = await background<Table>({
          op: "editCells",
          table: a,
          edits,
        });
        if (live.current) modify(result, "Изменены ячейки", "Edited cells");
      } else
        change(() => editCells(a, edits), "Изменены ячейки", "Edited cells");
    } catch (e) {
      notify(errorText(e, t));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function startEdit(r: number, c: number) {
    if (busy) return;
    cancelEdit.current = false;
    edit({ r, c });
    setDraft(a.meta?.formulas?.[address(r, c)] ?? str(a.rows[r]?.[c]));
  }
  function endEdit() {
    if (!editing || cancelEdit.current) return;
    cancelEdit.current = true;
    edit(null);
    const { r, c } = editing;
    if (draft !== (a.meta?.formulas?.[address(r, c)] ?? str(a.rows[r]?.[c])))
      void write([{ r, c, value: draft }]);
  }
  function chosen(value: string) {
    const edits = [];
    if (
      (range.bottom - range.top + 1) * (range.right - range.left + 1) >
      100000
    ) {
      notify(errorText(Error("styleLimit"), t));
      return;
    }
    for (let r = range.top; r <= range.bottom; r++)
      for (let c = range.left; c <= range.right; c++)
        edits.push({ r, c, value });
    void write(edits);
  }
  function format(patch: CellStyle) {
    if (a.rows.length)
      change(
        () => applyStyle(a, sel, patch),
        "Форматирование",
        "Formatted cells",
      );
  }
  function structure(
    axis: "row" | "col",
    action: "add" | "remove" | "before" | "after",
    at = axis === "row" ? R : C,
  ) {
    change(
      () => layout(a, axis, action, at),
      "Структура листа",
      "Sheet structure",
    );
  }
  function textToPaste(text: string) {
    const data = Papa.parse<string[]>(text, {
      delimiter: "\t",
      skipEmptyLines: false,
    }).data;
    if (data.length > 1 && data.at(-1)?.length === 1 && data.at(-1)?.[0] === "")
      data.pop();
    const edits = data.flatMap((row, i) =>
      row.map((value, j) => ({ r: R + i, c: C + j, value })),
    );
    if (edits.length) {
      edit(null);
      void write(edits);
    }
  }
  const copyText = () =>
    Papa.unparse(
      a.rows
        .slice(range.top, range.bottom + 1)
        .map((r) => r.slice(range.left, range.right + 1)),
      { delimiter: "\t", newline: "\n" },
    );
  async function clipboard(paste: boolean) {
    try {
      if (paste) textToPaste(await navigator.clipboard.readText());
      else await navigator.clipboard.writeText(copyText());
    } catch {
      D(paste ? "paste" : "copy");
      Bulk(paste ? "" : copyText());
    }
    menu(null);
  }
  function pointerDown(r: number, c: number, shift: boolean) {
    if (busy) return;
    anchor.current = shift ? point(sel.r, sel.c) : point(r, c);
    drag.current = "select";
    moved.current = shift;
    setSelection({ ...anchor.current, endR: r, endC: c });
  }
  function pointerEnter(r: number, c: number) {
    if (!drag.current) return;
    moved.current = true;
    setSelection({ ...anchor.current, endR: r, endC: c });
  }
  useEffect(() => {
    function stop() {
      if (drag.current === "fill" && moved.current)
        change(
          () => fillRange(a, anchor.current, selection.current),
          "Автозаполнение",
          "Autofill",
        );
      drag.current = null;
    }
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [a]);
  function navigation(r: number, c: number, extend = false) {
    r = Math.max(0, Math.min(a.rows.length - 1, r));
    c = Math.max(0, Math.min(a.cols.length - 1, c));
    setSelection(extend ? { ...sel, endR: r, endC: c } : point(r, c));
    const idx = ids.indexOf(r);
    if (idx >= 0) {
      if (per) P(Math.floor(idx / per));
      else if (
        scrollEl.current &&
        (offsets[idx] < pos.top || offsets[idx] > pos.top + pos.h - 74)
      )
        scrollEl.current.scrollTop = offsets[idx];
    }
  }
  function keyboard(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement,
      cmd = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (target.closest("input,textarea,select,dialog")) return;
    if (cmd && k === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (cmd && k === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (cmd && k === "f") {
      e.preventDefault();
      searchEl.current?.focus();
      return;
    }
    if (cmd && k === "a" && a.rows.length) {
      e.preventDefault();
      setSelection({
        r: 0,
        c: 0,
        endR: a.rows.length - 1,
        endC: a.cols.length - 1,
      });
      return;
    }
    if (cmd && k === "d") {
      e.preventDefault();
      change(
        () =>
          fillRange(
            a,
            { r: range.top, c: range.left, endR: range.top, endC: range.right },
            sel,
          ),
        "Автозаполнение",
        "Autofill",
      );
      return;
    }
    if (!a.rows.length) return;
    if (k === "delete" || k === "backspace") {
      e.preventDefault();
      chosen("");
      return;
    }
    if (k === "enter" || k === "f2") {
      e.preventDefault();
      startEdit(R, C);
      return;
    }
    const delta: Record<string, [number, number]> = {
      arrowleft: [0, -1],
      arrowright: [0, 1],
      arrowup: [-1, 0],
      arrowdown: [1, 0],
      tab: [0, e.shiftKey ? -1 : 1],
    };
    if (delta[k]) {
      e.preventDefault();
      navigation(
        sel.endR + delta[k][0],
        sel.endC + delta[k][1],
        e.shiftKey && k !== "tab",
      );
    }
  }
  const actionItems = [
    {
      id: "rowAdd",
      title: t("Вставить строку", "Insert row"),
      run: () => structure("row", "add"),
    },
    {
      id: "rowDel",
      title: t("Удалить строку", "Delete row"),
      run: () => structure("row", "remove"),
    },
    {
      id: "rowUp",
      title: t("Строку выше", "Move row up"),
      run: () => structure("row", "before"),
    },
    {
      id: "rowDown",
      title: t("Строку ниже", "Move row down"),
      run: () => structure("row", "after"),
    },
    {
      id: "colAdd",
      title: t("Вставить столбец", "Insert column"),
      run: () => structure("col", "add"),
    },
    {
      id: "colDel",
      title: t("Удалить столбец", "Delete column"),
      run: () => structure("col", "remove"),
    },
    {
      id: "colLeft",
      title: t("Столбец влево", "Move column left"),
      run: () => structure("col", "before"),
    },
    {
      id: "colRight",
      title: t("Столбец вправо", "Move column right"),
      run: () => structure("col", "after"),
    },
    {
      id: "colName",
      title: t("Название столбца", "Column name"),
      run: () => {
        Bulk(a.cols[C]);
        D("colName");
      },
    },
  ];
  const tools = (title: string, I: typeof Bold, fn: () => void, on = false) => (
    <button
      key={title}
      type="button"
      title={title}
      aria-label={title}
      className={"tool " + (on ? "selected" : "")}
      onClick={fn}
    >
      <I size={16} />
    </button>
  );
  function row(r: number, i: number, isFrozen: boolean) {
    const h = rowH(r);
    return (
      <tr key={r} style={{ height: h }}>
        <td
          className="rowindex"
          style={
            isFrozen
              ? { position: "sticky", top: 40 + offsets[i], zIndex: 6 }
              : undefined
          }
        >
          {r + 2}
        </td>
        {a.cols.map((col, c) => {
          const ref = address(r, c),
            s = a.meta?.styles?.[ref] ?? {},
            inRange =
              r >= range.top &&
              r <= range.bottom &&
              c >= range.left &&
              c <= range.right,
            highlight = checkRule(r, c);
          const css: CSSProperties = {
            height: h,
            backgroundColor: highlight ?? s.fill,
            color: s.color ?? (highlight || s.fill ? "#242238" : undefined),
            fontWeight: s.bold ? 750 : undefined,
            fontStyle: s.italic ? "italic" : undefined,
            fontFamily: s.font,
            textAlign: s.align,
            boxShadow: s.border ? "inset 0 0 0 1px #8a8ca4" : undefined,
          };
          if (c < frozenC || isFrozen)
            Object.assign(css, {
              position: "sticky",
              left: c < frozenC ? lefts[c] : undefined,
              top: isFrozen ? 40 + offsets[i] : undefined,
              zIndex: isFrozen && c < frozenC ? 5 : 3,
            });
          return (
            <td
              key={col}
              data-cell={ref}
              style={css}
              className={
                (inRange ? "in-range " : "") +
                (r === R && c === C ? "anchor " : "") +
                (c < frozenC || isFrozen ? "fixedcell" : "")
              }
              onPointerDown={(e) => {
                if (
                  e.button === 0 &&
                  !(e.target as HTMLElement).closest("input,.fill-handle")
                )
                  pointerDown(r, c, e.shiftKey);
              }}
              onPointerEnter={() => pointerEnter(r, c)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!inRange) setSelection(point(r, c));
                menu({
                  x: Math.min(e.clientX, innerWidth - 205),
                  y: Math.min(e.clientY, innerHeight - 295),
                });
              }}
            >
              {editing?.r === r && editing.c === c ? (
                <input
                  autoFocus
                  aria-label={t("Значение ячейки", "Cell value")}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={endEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      endEdit();
                      scrollEl.current?.focus();
                    }
                    if (e.key === "Escape") {
                      cancelEdit.current = true;
                      edit(null);
                      scrollEl.current?.focus();
                    }
                  }}
                />
              ) : (
                <button
                  aria-label={col + " · " + (r + 1)}
                  title={a.meta?.formulas?.[ref] ?? str(a.rows[r][c])}
                  onClick={(e) => {
                    if (!moved.current && !e.shiftKey) {
                      setSelection(point(r, c));
                      startEdit(r, c);
                    }
                    moved.current = false;
                  }}
                >
                  {formatted(a.rows[r][c], s, t("ru", "en")) || " "}
                </button>
              )}
              {r === range.bottom && c === range.right && (
                <span
                  className="fill-handle"
                  title={t("Протянуть диапазон", "Drag to fill")}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drag.current = "fill";
                    anchor.current = sel;
                    moved.current = false;
                  }}
                />
              )}
            </td>
          );
        })}
      </tr>
    );
  }
  return (
    <section
      className="editor2"
      onKeyDown={keyboard}
      onPaste={(e) => {
        const v = e.clipboardData.getData("text/plain");
        if (e.target instanceof HTMLInputElement && !/[\t\n]/.test(v)) return;
        if ((e.target as HTMLElement).closest("dialog")) return;
        e.preventDefault();
        textToPaste(v);
      }}
      onCopy={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea")) return;
        e.preventDefault();
        e.clipboardData.setData("text/plain", copyText());
      }}
    >
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
          {t("Сохранить сценарий", "Save scenario")} {a.steps.length || ""}
        </button>
        <button className="btn" disabled={!canUndo} onClick={undo}>
          <Undo2 size={15} />
          {t("Отменить", "Undo")}
        </button>
        <button className="btn" disabled={!canRedo} onClick={redo}>
          <Redo2 size={15} />
          {t("Повторить", "Redo")}
        </button>
      </div>
      <fieldset disabled={busy} className="panel workbook">
        <div className="sheettabs">
          {tables.map((s) => (
            <button
              key={s.id}
              className={s.id === a.id ? "active" : ""}
              onClick={() => open(s.id)}
            >
              <Sheet size={14} />
              {display(s)}
            </button>
          ))}
          <button
            title={t("Создать лист", "Create sheet")}
            aria-label={t("Создать лист", "Create sheet")}
            onClick={() => act("newSheet")}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="ribbon">
          <select
            aria-label={t("Тип данных", "Data type")}
            value={style.type ?? "auto"}
            onChange={(e) => format({ type: e.target.value as CellType })}
          >
            {Object.entries({
              auto: t("Авто", "Auto"),
              text: t("Текст", "Text"),
              number: t("Число", "Number"),
              date: t("Дата", "Date"),
              currency: t("Валюта", "Currency"),
              percent: t("Проценты", "Percent"),
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label={t("Шрифт", "Font")}
            value={style.font || "Manrope Variable"}
            onChange={(e) => format({ font: e.target.value })}
          >
            {["Manrope Variable", "Arial", "Georgia", "Courier New"].map(
              (f) => (
                <option key={f}>{f}</option>
              ),
            )}
          </select>
          {tools(
            t("Жирный", "Bold"),
            Bold,
            () => format({ bold: !style.bold }),
            style.bold,
          )}
          {tools(
            t("Курсив", "Italic"),
            Italic,
            () => format({ italic: !style.italic }),
            style.italic,
          )}
          <label className="color-tool" title={t("Цвет текста", "Text color")}>
            <Type size={15} />
            <input
              type="color"
              aria-label={t("Цвет текста", "Text color")}
              value={style.color || "#242238"}
              onChange={(e) => format({ color: e.target.value })}
            />
          </label>
          <label className="color-tool" title={t("Цвет заливки", "Fill color")}>
            <PaintBucket size={15} />
            <input
              type="color"
              aria-label={t("Цвет заливки", "Fill color")}
              value={style.fill || "#ece9ff"}
              onChange={(e) => format({ fill: e.target.value })}
            />
          </label>
          {tools(
            t("Границы", "Borders"),
            Grid2X2,
            () => format({ border: !style.border }),
            style.border,
          )}
          {tools(t("Влево", "Align left"), AlignLeft, () =>
            format({ align: "left" }),
          )}
          {tools(t("По центру", "Center"), AlignCenter, () =>
            format({ align: "center" }),
          )}
          {tools(t("Вправо", "Align right"), AlignRight, () =>
            format({ align: "right" }),
          )}
          <span className="toolsep" />
          {tools(
            t("Условное форматирование", "Conditional formatting"),
            Highlighter,
            () => D("rules"),
          )}
          {tools(t("Размеры и закрепление", "Size and freeze"), Settings2, () =>
            D("view"),
          )}
          {tools(t("Заполнить диапазон", "Set range value"), Paintbrush, () => {
            Bulk("");
            D("bulk");
          })}
          <select
            aria-label={t("Структура листа", "Sheet structure")}
            value=""
            onChange={(e) =>
              actionItems.find((i) => i.id === e.target.value)?.run()
            }
          >
            <option value="">{t("Структура", "Structure")}</option>
            {actionItems.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        </div>
        <div className="formulabar">
          <b>
            {key}
            {sel.endR !== R || sel.endC !== C
              ? " : " + address(sel.endR, sel.endC)
              : ""}
          </b>
          <i>ƒx</i>
          <input
            aria-label={t("Строка формул", "Formula bar")}
            value={bar}
            placeholder={t(
              "Значение или формула, например =SUM(B2:B5)",
              "Value or formula, e.g. =SUM(B2:B5)",
            )}
            onChange={(e) => setBar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && bar !== raw)
                void write([{ r: R, c: C, value: bar }]);
              if (e.key === "Escape") setBar(raw);
            }}
          />
          {tools(t("Ввести значение", "Enter value"), Check, () => {
            if (bar !== raw) void write([{ r: R, c: C, value: bar }]);
          })}
        </div>
        <div className="sheettools">
          <div className="searchbox">
            <Search size={15} />
            <input
              ref={searchEl}
              aria-label={t("Поиск в таблице", "Search in table")}
              placeholder={t("Поиск в таблице…", "Search in table…")}
              value={q}
              onChange={(e) => {
                Q(e.target.value);
                P(0);
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn compact"
              onClick={() => structure("row", "add", a.rows.length)}
            >
              <Plus size={14} />
              {t("Строка", "Row")}
            </button>
            {tools(
              t("Действия с листом", "Sheet actions"),
              MoreHorizontal,
              () => act("tablemenu", a.id),
            )}
          </div>
        </div>
        <div
          tabIndex={0}
          ref={scrollEl}
          className="sheet-scroll viewport"
          onScroll={(e) => {
            if (!per)
              scroll({
                top: e.currentTarget.scrollTop,
                h: e.currentTarget.clientHeight,
              });
          }}
        >
          <table className="sheet cells" style={{ width: lefts.at(-1) }}>
            <colgroup>
              <col style={{ width: 42 }} />
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {a.cols.map((col, c) => (
                  <th
                    key={col}
                    aria-label={col}
                    style={
                      c < frozenC ? { left: lefts[c], zIndex: 8 } : undefined
                    }
                  >
                    <span>{colName(c)}</span>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {frozenIds.map((r, i) => row(r, i, true))}
              {!per && first > frozenR && (
                <tr aria-hidden="true">
                  <td
                    colSpan={a.cols.length + 1}
                    style={{ height: offsets[first] - offsets[frozenR] }}
                  />
                </tr>
              )}
              {visible.map((r, i) => row(r, first + i, first + i < frozenR))}
              {!per && last < ids.length && (
                <tr aria-hidden="true">
                  <td
                    colSpan={a.cols.length + 1}
                    style={{ height: offsets[ids.length] - offsets[last] }}
                  />
                </tr>
              )}
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
            {busy
              ? t("Вычисление…", "Calculating…")
              : t("В выборке", "Matching rows") +
                " · " +
                ids.length.toLocaleString(t("ru", "en"))}
          </small>
          <div>
            <select
              aria-label={t("Строк на странице", "Rows per page")}
              value={per}
              onChange={(e) => {
                Per(Number(e.target.value));
                P(0);
                if (scrollEl.current) scrollEl.current.scrollTop = 0;
              }}
            >
              <option value="0">{t("Прокрутка", "Scroll")}</option>
              {[20, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {per > 0 && (
              <>
                <button
                  className="iconbtn"
                  disabled={!pg}
                  aria-label={t("Предыдущая страница", "Previous page")}
                  onClick={() => P(pg - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  {pg + 1} / {pages}
                </span>
                <button
                  className="iconbtn"
                  disabled={pg + 1 >= pages}
                  aria-label={t("Следующая страница", "Next page")}
                  onClick={() => P(pg + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </fieldset>
      <p className="editorhint">
        <Pencil size={14} />
        {t(
          "Клик — ввод · Shift+клик — диапазон · Ctrl+C / Ctrl+V — обмен с Excel · ПКМ — действия. Заголовки находятся в строке 1.",
          "Click to edit · Shift+click for ranges · Ctrl+C / Ctrl+V to exchange with Excel · Right-click for actions. Row 1 contains headers.",
        )}
      </p>
      {context && (
        <>
          <button
            className="ctxback"
            aria-label={t("Закрыть меню", "Close menu")}
            onClick={() => menu(null)}
          />
          <div
            className="ctxmenu"
            style={{ left: context.x, top: context.y }}
            role="menu"
          >
            {[
              [t("Копировать", "Copy"), () => clipboard(false)],
              [t("Вставить", "Paste"), () => clipboard(true)],
              [
                t("Заполнить диапазон", "Set range value"),
                () => {
                  Bulk("");
                  D("bulk");
                },
              ],
              ...actionItems.map((a) => [a.title, a.run]),
            ].map(([title, fn]) => (
              <button
                role="menuitem"
                key={String(title)}
                onClick={() => {
                  menu(null);
                  (fn as () => void)();
                }}
              >
                {String(title)}
              </button>
            ))}
          </div>
        </>
      )}
      {dialog === "view" && (
        <ViewSettings
          a={a}
          r={R}
          c={C}
          t={t}
          close={() => D("")}
          apply={(s) => modify(s, "Настройки листа", "Sheet settings")}
        />
      )}
      {dialog === "rules" && (
        <RuleDialog
          a={a}
          c={C}
          t={t}
          close={() => D("")}
          apply={(s) => modify(s, "Правила оформления", "Formatting rules")}
        />
      )}
      {["bulk", "colName", "paste", "copy"].includes(dialog) && (
        <Modal
          title={
            dialog === "bulk"
              ? t("Заполнить диапазон", "Set range value")
              : dialog === "colName"
                ? t("Название столбца", "Column name")
                : t("Буфер обмена", "Clipboard")
          }
          close={() => D("")}
        >
          <label>
            {dialog === "copy"
              ? t("Скопируйте текст", "Copy this text")
              : dialog === "paste"
                ? t("Вставьте данные из таблицы", "Paste tabular data")
                : t("Значение", "Value")}
            <textarea
              autoFocus
              value={bulk}
              onChange={(e) => Bulk(e.target.value)}
            />
          </label>
          <div className="modalfoot">
            <button
              className="btn primary"
              onClick={() => {
                if (dialog === "bulk") chosen(bulk);
                if (dialog === "paste") textToPaste(bulk);
                if (dialog === "colName") {
                  if (
                    !bulk.trim() ||
                    a.cols.some((v, i) => i !== C && v === bulk.trim())
                  ) {
                    notify(errorText(Error("outputNames"), t));
                    return;
                  }
                  modify(
                    recalculate({
                      ...a,
                      steps: [],
                      cols: a.cols.map((v, i) => (i === C ? bulk.trim() : v)),
                      meta: {
                        ...a.meta,
                        rules: a.meta?.rules?.map((rule) =>
                          rule.col === a.cols[C]
                            ? { ...rule, col: bulk.trim() }
                            : rule,
                        ),
                      },
                    }),
                    "Переименован столбец",
                    "Column renamed",
                  );
                }
                D("");
              }}
            >
              {t("Готово", "Done")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
