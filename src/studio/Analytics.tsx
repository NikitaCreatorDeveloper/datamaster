import { useState, useEffect, useRef } from "react";
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PieController,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Legend,
  Tooltip,
  Filler,
} from "chart.js";
import {
  BarChart3,
  ChartLine,
  ChartPie,
  Download,
  FileText,
  SlidersHorizontal,
  BookmarkPlus,
  Trash2,
  Table2,
  Wallet,
  TrendingUp,
  Receipt,
  Coins,
} from "lucide-react";
import { type Table, str } from "../core";
import { type T, errorText, ErrorBox, Modal } from "../ui";
import type { ChartConfig, Aggregation } from "./model";
import { defaultChart, calculateReport } from "./analytics";
import { Choice, Field, PreviewGrid } from "./widgets";
import { background } from "./worker";
import { saveBlob } from "./download";
Chart.register(
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PieController,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Legend,
  Tooltip,
  Filler,
);
type Report = ReturnType<typeof calculateReport>;
const colors = [
  "#7863df",
  "#2d9e91",
  "#d8964d",
  "#5086d5",
  "#bd68a1",
  "#89a14e",
  "#bf7365",
  "#83899d",
];
export function Analytics({
  tables,
  id,
  boards,
  saveBoards,
  t,
  display,
  dark,
  notify,
}: {
  tables: Table[];
  id: string;
  boards: ChartConfig[];
  saveBoards: (b: ChartConfig[]) => void;
  t: T;
  display: (a: Table) => string;
  dark: boolean;
  notify: (s: string) => void;
}) {
  const first = tables.find((s) => s.id === id) ?? tables[0];
  const [cfg, config] = useState(() => defaultChart(first)),
    [report, setReport] = useState<Report | null>(null),
    [err, E] = useState(""),
    [busy, Busy] = useState(false),
    [name, N] = useState(""),
    [save, Save] = useState(false),
    [mapping, MapOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    chart = useRef<Chart | null>(null);
  const a = tables.find((s) => s.id === cfg.sheetId) ?? first,
    lang = t("ru", "en"),
    fmt = (n: number | null) =>
      n == null ? "—" : n.toLocaleString(lang, { maximumFractionDigits: 2 }),
    update = (v: Partial<ChartConfig>) => config((c) => ({ ...c, ...v }));
  useEffect(() => {
    const ac = new AbortController();
    Busy(true);
    setReport(null);
    E("");
    background<Report>(
      { op: "report", grid: { cols: a.cols, rows: a.rows }, config: cfg },
      ac.signal,
    )
      .then((r) => {
        if (!ac.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!ac.signal.aborted) E(errorText(e, t));
      })
      .finally(() => {
        if (!ac.signal.aborted) Busy(false);
      });
    return () => ac.abort();
  }, [a, cfg]);
  useEffect(() => {
    if (!canvas.current || !report) return;
    const ctx = canvas.current.getContext("2d")!,
      g = report.pivot,
      rows = g.rows.slice(0, 36),
      labels = rows.map((r) => str(r[0]) || "∅"),
      pie = cfg.chart === "pie";
    const datasets = g.cols.slice(1, pie ? 2 : 7).map((col, i) => ({
      label: col,
      data: rows.map((r) =>
        typeof r[i + 1] === "number" ? Number(r[i + 1]) : null,
      ),
      borderRadius: 5,
      borderSkipped: false,
      backgroundColor: pie
        ? rows.map((_, j) => colors[j % colors.length])
        : cfg.chart === "line"
          ? colors[i] + "26"
          : colors[i],
      borderColor: pie ? (dark ? "#222330" : "#ffffff") : colors[i],
      borderWidth: pie ? 2 : cfg.chart === "line" ? 2 : 0,
      pointRadius: 3,
      tension: 0.28,
      fill: cfg.chart === "line",
      maxBarThickness: 55,
    }));
    const labelColor = dark ? "#cfcddd" : "#63697a",
      lines = dark ? "#ffffff17" : "#e7e8f0";
    chart.current = new Chart(ctx, {
      type: cfg.chart,
      data: { labels, datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        locale: lang,
        plugins: {
          legend: {
            display: pie || datasets.length > 1,
            position: "bottom",
            labels: {
              color: labelColor,
              usePointStyle: true,
              boxWidth: 10,
              font: { size: 11 },
            },
          },
          tooltip: { enabled: true },
        },
        scales: pie
          ? {}
          : {
              x: {
                ticks: {
                  color: labelColor,
                  maxTicksLimit: 12,
                  maxRotation: 25,
                },
                grid: { display: false },
              },
              y: {
                beginAtZero: true,
                ticks: { color: labelColor, maxTicksLimit: 5 },
                grid: { color: lines },
              },
            },
      },
    });
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [report, cfg.chart, dark, lang]);
  function png() {
    const el = canvas.current;
    if (!el) return;
    const copy = document.createElement("canvas");
    copy.width = el.width;
    copy.height = el.height;
    const c = copy.getContext("2d")!;
    c.fillStyle = dark ? "#202232" : "#fff";
    c.fillRect(0, 0, copy.width, copy.height);
    c.drawImage(el, 0, 0);
    return copy;
  }
  const aggs: Record<Aggregation, string> = {
    sum: t("Сумма", "Sum"),
    mean: t("Среднее", "Average"),
    count: t("Количество", "Count"),
    min: t("Минимум", "Minimum"),
    max: t("Максимум", "Maximum"),
  };
  const kpis = [
    {
      label: t("Выручка", "Revenue"),
      v: report?.revenue ?? null,
      I: Wallet,
      tag: "mint",
    },
    {
      label: t("Расходы", "Expenses"),
      v: report?.cost ?? null,
      I: Receipt,
      tag: "peach",
    },
    {
      label: t("Прибыль", "Profit"),
      v: report?.profit ?? null,
      I: Coins,
      tag: "periwinkle",
    },
    {
      label: t("Динамика выручки", "Revenue change"),
      v: report?.change ?? null,
      I: TrendingUp,
      tag: "sky",
    },
  ];
  const values = cfg.filterCol
    ? [
        ...new Set(a.rows.map((r) => str(r[a.cols.indexOf(cfg.filterCol)]))),
      ].slice(0, 500)
    : [];
  return (
    <>
      <div className="pagetitle">
        <div>
          <h1>{t("Аналитика", "Analytics")}</h1>
          <p>
            {t(
              "Сводные отчёты и показатели выбранного листа",
              "Pivot reports and metrics for the selected sheet",
            )}
          </p>
        </div>
        <div className="buttonrow">
          <button
            className="btn"
            onClick={() => {
              N(cfg.name || display(a));
              Save(true);
            }}
          >
            <BookmarkPlus size={15} />
            {t("Сохранить панель", "Save dashboard")}
          </button>
          <button
            className="btn primary"
            disabled={!report || busy}
            onClick={async () => {
              try {
                const { pdfReport } = await import("./pdf");
                pdfReport(
                  cfg.name || display(a),
                  report!.pivot,
                  png()?.toDataURL("image/png"),
                  kpis
                    .filter((k) => k.v != null)
                    .map(
                      (k) =>
                        k.label + " " + fmt(k.v) + (k.tag === "sky" ? "%" : ""),
                    )
                    .join(" · "),
                );
              } catch (e) {
                notify(errorText(e, t));
              }
            }}
          >
            <FileText size={15} />
            PDF
          </button>
        </div>
      </div>
      {boards.length > 0 && (
        <div className="boardtabs">
          {boards.map((b) => (
            <span key={b.id}>
              <button
                onClick={() => {
                  const source = tables.find((a) => a.id === b.sheetId);
                  if (source) config({ ...b });
                  else
                    notify(
                      t("Лист отчёта удалён", "The source sheet was removed"),
                    );
                }}
              >
                {b.name}
              </button>
              <button
                aria-label={t("Удалить панель ", "Delete dashboard ") + b.name}
                onClick={() => saveBoards(boards.filter((x) => x.id !== b.id))}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="analytics-kpis">
        {kpis.map((k, i) => (
          <div className="panel kpi" key={k.label}>
            <div>
              <span className={"metricicon " + k.tag}>
                <k.I size={17} />
              </span>
              {k.label}
            </div>
            <b>
              {fmt(k.v)}
              {i === 3 && k.v != null ? "%" : ""}
            </b>
            <small>
              {i === 3 && report?.periods.length === 2
                ? report.periods.join(" → ")
                : k.v == null
                  ? t("Требуется поле данных", "Map a data column")
                  : display(a)}
            </small>
          </div>
        ))}
      </div>
      <div className="analytics-layout">
        <section className="panel studio-panel">
          <div className="panelhead">
            <div>
              <h2>{cfg.name || cfg.measure + " · " + cfg.group}</h2>
              <small className="muted">
                {aggs[cfg.agg]} · {t("Строк", "Rows")}{" "}
                {report?.rows.toLocaleString(lang) ?? "…"}
              </small>
            </div>
            <div className="charttypes">
              {(
                [
                  ["bar", BarChart3, t("Столбцы", "Bar")],
                  ["line", ChartLine, t("Линия", "Line")],
                  ["pie", ChartPie, t("Круг", "Pie")],
                ] as const
              ).map(([type, I, label]) => (
                <button
                  key={type}
                  aria-label={label}
                  title={label}
                  className={cfg.chart === type ? "on" : ""}
                  onClick={() => update({ chart: type })}
                >
                  <I size={16} />
                </button>
              ))}
            </div>
          </div>
          <div className="chartwrap">
            {report?.pivot.rows.length ? (
              <canvas
                ref={canvas}
                aria-label={t("Диаграмма отчёта", "Report chart")}
                role="img"
              />
            ) : (
              <div className="emptywell">
                {busy
                  ? t("Расчёт…", "Calculating…")
                  : t("Нет данных для диаграммы", "No chart data")}
              </div>
            )}
          </div>
          <div className="chartfoot">
            <small>
              {t("Групп", "Groups")} {report?.pivot.rows.length ?? 0}
              {(report?.pivot.rows.length ?? 0) > 36
                ? t(" · первые 36 на графике", " · first 36 plotted")
                : ""}
            </small>
            <button
              className="textlink"
              disabled={!report?.pivot.rows.length}
              onClick={() =>
                png()?.toBlob((b) => {
                  if (b) saveBlob(b, (cfg.name || display(a)) + ".png");
                })
              }
            >
              <Download size={14} />
              PNG
            </button>
          </div>
          <ErrorBox message={err} />
        </section>
        <aside className="panel studio-panel configpanel">
          <h2>
            <SlidersHorizontal size={17} />
            {t("Настройки отчёта", "Report settings")}
          </h2>
          <Field label={t("Лист отчёта", "Report sheet")}>
            <select
              value={a.id}
              onChange={(e) =>
                config(
                  defaultChart(tables.find((x) => x.id === e.target.value)!),
                )
              }
            >
              {tables.map((s) => (
                <option key={s.id} value={s.id}>
                  {display(s)}
                </option>
              ))}
            </select>
          </Field>
          <div className="formgrid">
            <Choice
              label={t("Группировка", "Group by")}
              value={cfg.group}
              options={a.cols}
              change={(group) => update({ group })}
            />
            <Choice
              label={t("Показатель", "Measure")}
              value={cfg.measure}
              options={a.cols}
              change={(measure) => update({ measure })}
            />
          </div>
          <div className="formgrid">
            <Field label={t("Агрегация", "Aggregation")}>
              <select
                value={cfg.agg}
                onChange={(e) => update({ agg: e.target.value as Aggregation })}
              >
                {Object.entries(aggs).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Choice
              label={t("Разбивка", "Series")}
              blank={t("Нет", "None")}
              value={cfg.split}
              options={a.cols}
              change={(split) => update({ split })}
            />
          </div>
          <div className="formgrid">
            <Choice
              label={t("Фильтр", "Filter")}
              blank={t("Все строки", "All rows")}
              value={cfg.filterCol}
              options={a.cols}
              change={(filterCol) => update({ filterCol, filterValue: "" })}
            />
            <Field label={t("Значение фильтра", "Filter value")}>
              <input
                list="report-filters"
                disabled={!cfg.filterCol}
                value={cfg.filterValue}
                onChange={(e) => update({ filterValue: e.target.value })}
              />
              <datalist id="report-filters">
                {values.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </Field>
          </div>
          <button className="textlink" onClick={() => MapOpen(!mapping)}>
            {t("Настроить поля KPI", "Map KPI columns")}
          </button>
          {mapping && (
            <div className="formgrid">
              {(["revenue", "cost", "profit", "date"] as const).map((k, i) => (
                <Choice
                  key={k}
                  label={i === 3 ? t("Период", "Period") : kpis[i].label}
                  blank={t("Не задано", "Unmapped")}
                  value={cfg[k]}
                  options={a.cols}
                  change={(v) => update({ [k]: v })}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
      {report && (
        <section className="panel studio-panel topgap">
          <div className="panelhead">
            <h2>{t("Сводная таблица", "Pivot table")}</h2>
            <Table2 size={17} />
          </div>
          <PreviewGrid g={report.pivot} t={t} max={40} />
        </section>
      )}
      {save && (
        <Modal
          title={t("Сохранить панель", "Save dashboard")}
          close={() => Save(false)}
        >
          <Field label={t("Название панели", "Dashboard name")}>
            <input
              value={name}
              onChange={(e) => N(e.target.value)}
              maxLength={80}
            />
          </Field>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              const b = { ...cfg, id: crypto.randomUUID(), name: name.trim() };
              saveBoards([...boards, b]);
              config(b);
              Save(false);
              notify(
                t("Панель добавлена в проект", "Dashboard added to project"),
              );
            }}
          >
            {t("Сохранить", "Save")}
          </button>
        </Modal>
      )}
    </>
  );
}
