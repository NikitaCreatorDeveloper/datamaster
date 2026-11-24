import { useState } from "react";
import {
  ArrowRightLeft,
  Table2,
  Workflow,
  Database,
  Upload,
  FlaskConical,
  Search,
  MoreHorizontal,
  ChevronRight,
  GitMerge,
  CopyMinus,
  Calculator,
  FileSpreadsheet,
  Filter,
  ChartNoAxesCombined,
  ListChecks,
  Percent,
  SlidersHorizontal,
  Rows3,
  Play,
} from "lucide-react";
import { type Table, type Recipe } from "./core";
import { templates } from "./demo";
import { Artwork } from "./Artwork";
import { FormatIcon, type T } from "./ui";
export type DContext = {
  t: T;
  tables: Table[];
  recipes: Recipe[];
  display: (a: Table) => string;
  open: (id: string) => void;
  act: (kind: string, id?: string) => void;
  go: (view: string) => void;
};
const quick = [
  {
    key: "dedupe",
    ru: "Удалить дубли",
    en: "Remove duplicates",
    Icon: CopyMinus,
    color: "mint",
  },
  {
    key: "price",
    ru: "Пересчитать цены",
    en: "Recalculate prices",
    Icon: Calculator,
    color: "peach",
  },
  {
    key: "merge",
    ru: "Объединить таблицы",
    en: "Merge tables",
    Icon: GitMerge,
    color: "sky",
  },
  {
    key: "compare",
    ru: "Сравнить таблицы",
    en: "Compare tables",
    Icon: ArrowRightLeft,
    color: "lilac",
  },
];
export function TableList({
  ctx,
  all = false,
}: {
  ctx: DContext;
  all?: boolean;
}) {
  const { t, tables, display, open, act, go } = ctx,
    [q, Q] = useState(""),
    [format, F] = useState(""),
    [sort, S] = useState("newest");
  const sorted = [...tables].sort((a, b) =>
    sort === "name"
      ? display(a).localeCompare(display(b))
      : b.updated - a.updated,
  );
  const list = all
    ? sorted.filter(
        (a) =>
          display(a).toLowerCase().includes(q.toLowerCase()) &&
          (!format || format === a.format),
      )
    : sorted.slice(0, 4);
  return (
    <section className="panel table-panel">
      <div className="panelhead">
        <h2>
          {all
            ? t("Все таблицы", "All tables")
            : t("Недавние таблицы", "Recent tables")}
        </h2>
        {all ? (
          <span className="count">{tables.length}</span>
        ) : (
          <button className="textlink" onClick={() => go("tables")}>
            {t("Все таблицы", "All tables")}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      {all && (
        <div className="filters">
          <div className="searchbox">
            <Search size={15} />
            <input
              aria-label={t("Поиск таблиц", "Search tables")}
              placeholder={t("Поиск таблиц…", "Search tables…")}
              value={q}
              onChange={(e) => Q(e.target.value)}
            />
          </div>
          <select
            aria-label={t("Формат", "Format")}
            value={format}
            onChange={(e) => F(e.target.value)}
          >
            <option value="">{t("Все форматы", "All formats")}</option>
            {["XLSX", "CSV", "JSON", "API"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select
            aria-label={t("Порядок", "Order")}
            value={sort}
            onChange={(e) => S(e.target.value)}
          >
            <option value="newest">{t("По обновлению", "Last updated")}</option>
            <option value="name">{t("По имени", "Name")}</option>
          </select>
        </div>
      )}
      <div className="filehead filegrid">
        <span>{t("Название", "Name")}</span>
        <span>{t("Формат", "Format")}</span>
        <span>{t("Строки", "Rows")}</span>
        <span />
      </div>
      {list.map((a) => (
        <div key={a.id} className="filerow filegrid">
          <button className="filemain" onClick={() => open(a.id)}>
            <FormatIcon format={a.format} />
            <span>
              <strong>{display(a)}</strong>
              <small>
                {a.demo
                  ? t("Демоданные", "Demo data")
                  : t("Рабочая таблица", "Workspace table")}
                <span className="middot">·</span>
                {t("столбцов", "columns")} {a.cols.length}
              </small>
            </span>
          </button>
          <span className={"format-tag tag-" + a.format}>{a.format}</span>
          <span className="rownum">
            {a.rows.length.toLocaleString(t("ru", "en"))}
          </span>
          <button
            className="iconbtn tiny"
            aria-label={
              t("Действия с таблицей ", "Table actions for ") + display(a)
            }
            onClick={() => act("tablemenu", a.id)}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      ))}
      {!list.length && (
        <div className="empty">
          {q || format
            ? t("Совпадений нет", "No matching tables")
            : t("Импортируйте первую таблицу", "Import your first table")}
        </div>
      )}
    </section>
  );
}
const illustrations = [
  { icons: [FileSpreadsheet, Percent, ChartNoAxesCombined], theme: "lavender" },
  { icons: [Database, Filter, ListChecks], theme: "sea" },
  { icons: [Rows3, SlidersHorizontal, ChartNoAxesCombined], theme: "sand" },
];
export function Scenarios({
  ctx,
  all = false,
}: {
  ctx: DContext;
  all?: boolean;
}) {
  const { t, go, act, recipes } = ctx;
  return (
    <section className={"scenarios " + (all ? "library" : "")}>
      <div className="sectionhead">
        <div>
          <h2>{t("Готовые сценарии", "Ready-made scenarios")}</h2>
          <p>
            {t(
              "Бизнес-задачи с тестовыми данными",
              "Business workflows with sample data",
            )}
          </p>
        </div>
        {!all && (
          <button className="textlink" onClick={() => go("scenarios")}>
            {t("Все сценарии", "All scenarios")}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="templategrid">
        {templates.map((r, i) => {
          const art = illustrations[i];
          return (
            <button
              key={r.id}
              className="templatecard"
              onClick={() => act("recipe", r.id)}
            >
              <div className={"templateart " + art.theme}>
                <span className="demochip">
                  <span />
                  {t("Демо", "Demo")}
                </span>
                <div className="nodes">
                  {art.icons.map((I, j) => (
                    <span className={"node n" + j} key={j}>
                      <I size={j === 1 ? 23 : 19} />
                    </span>
                  ))}
                </div>
              </div>
              <div className="templatebody">
                <h3>{t(...r.title)}</h3>
                <p>{t(...r.description)}</p>
                <small>
                  <Workflow size={13} />
                  {r.steps.length} {t("шага", "steps")}
                  <ChevronRight size={14} />
                </small>
              </div>
            </button>
          );
        })}
      </div>
      {all && (
        <div className="savedsection">
          <h2>{t("Мои сценарии", "My scenarios")}</h2>
          {recipes.length ? (
            recipes.map((r) => (
              <div className="savedrow" key={r.id}>
                <Workflow size={19} />
                <strong>{r.name}</strong>
                <small>
                  {t("Шагов", "Steps")} {r.steps.length}
                </small>
                <button className="btn" onClick={() => act("saved", r.id)}>
                  <Play size={14} />
                  {t("Запустить", "Run")}
                </button>
                <button
                  className="textlink"
                  onClick={() => act("deleteRecipe", r.id)}
                >
                  {t("Удалить", "Delete")}
                </button>
              </div>
            ))
          ) : (
            <div className="panel empty">
              {t(
                "Примените операции в редакторе таблицы и нажмите «Сохранить сценарий».",
                "Apply operations in a table editor and click “Save scenario”.",
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
function MiniChart({
  values,
  c,
  type,
}: {
  values: number[];
  c: string;
  type: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <div aria-hidden="true" className={"mini-chart " + c + " chart" + type}>
      {values.map((n, i) => (
        <i
          key={i}
          style={{
            height: 12 + (82 * n) / max + "%",
            opacity: 0.32 + (0.68 * (i + 1)) / values.length,
          }}
        />
      ))}
    </div>
  );
}
export function Dashboard({ ctx }: { ctx: DContext }) {
  const { t, tables, recipes, act, go } = ctx;
  const cards = [
    {
      name: t("Таблицы", "Tables"),
      value: tables.length,
      Icon: Table2,
      color: "periwinkle",
      values: ["JSON", "CSV", "XLSX", "API"].map(
        (f) => tables.filter((a) => a.format === f).length,
      ),
      caption: t("в рабочей области", "in the workspace"),
    },
    {
      name: t("Строки данных", "Data rows"),
      value: tables.reduce((n, a) => n + a.rows.length, 0),
      Icon: Database,
      color: "mint",
      values: tables.slice(-8).map((a) => a.rows.length),
      caption: t("во всех таблицах", "across all tables"),
    },
    {
      name: t("Сценарии", "Scenarios"),
      value: templates.length + recipes.length,
      Icon: Workflow,
      color: "peach",
      values: [...templates, ...recipes].slice(-8).map((r) => r.steps.length),
      caption: t("готовы к запуску", "ready to run"),
    },
  ];
  return (
    <>
      <div className="hero">
        <div className="hero-dots" />
        <Artwork />
        <div className="herocopy">
          <div className="studio">
            <span className="studio-dot" />
            DATA STUDIO
          </div>
          <h1>{t("Рабочее пространство", "Workspace overview")}</h1>
          <p>
            {t(
              "Таблицы, данные и автоматизация в одном месте.",
              "Tables, data and automation in one place.",
            )}
          </p>
          <div className="heroactions">
            <button className="btn hero-primary" onClick={() => act("import")}>
              <Upload size={16} />
              {t("Импорт данных", "Import data")}
            </button>
            <button
              className="btn hero-secondary"
              onClick={() => go("scenarios")}
            >
              <FlaskConical size={16} />
              {t("Демо-сценарии", "Demo scenarios")}
            </button>
          </div>
        </div>
      </div>
      <div className="metricgrid">
        {cards.map((o, i) => (
          <div className="metric" key={i}>
            <span className={"metricicon " + o.color}>
              <o.Icon size={19} />
            </span>
            <div className="metrictext">
              <span>{o.name}</span>
              <b>{o.value.toLocaleString(t("ru", "en"))}</b>
              <small>{o.caption}</small>
            </div>
            <MiniChart type={i} values={o.values} c={o.color} />
          </div>
        ))}
      </div>
      <div className="dashboardmiddle">
        <TableList ctx={ctx} />
        <section className="panel quickpanel">
          <div className="panelhead">
            <h2>{t("Быстрые действия", "Quick actions")}</h2>
            <span className="bolt">ϟ</span>
          </div>
          <div className="quicklist">
            {quick.map((q) => (
              <button key={q.key} onClick={() => act(q.key)}>
                <span className={"quickicon " + q.color}>
                  <q.Icon size={17} />
                </span>
                <span>{t(q.ru, q.en)}</span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </section>
      </div>
      <Scenarios ctx={ctx} />
    </>
  );
}
