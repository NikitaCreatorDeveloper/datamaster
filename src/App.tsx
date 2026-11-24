import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Table2,
  Workflow,
  History,
  Upload,
  Globe2,
  Sun,
  Moon,
  Menu,
  PanelLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Undo2,
  Trash2,
  Download,
  Pencil,
  FileInput,
  Layers3,
  CheckCircle2,
  PlugZap,
  X,
  Clock3,
  BarChart3,
  FolderOpen,
  ScanSearch,
  Waypoints,
  CopyPlus,
  Plus,
  ChevronDown as Down,
} from "lucide-react";
import { demoNames, templates } from "./demo";
import { type Table, type Step, type Recipe } from "./core";
import { Dashboard, TableList, Scenarios, type DContext } from "./Dashboard";
import { Editor } from "./Editor";
import {
  ImportDialog,
  OpDialog,
  CombineDialog,
  RecipeDialog,
  ExportDialog,
  NameDialog,
  type NewTable,
} from "./dialogs";
import { useProjects } from "./studio/projects";
import { blankSheet } from "./studio/sheets";
import { BusinessGallery } from "./studio/BusinessGallery";
import { launchSample } from "./businessSamples";
import { ProjectManager } from "./studio/ProjectManager";
import { ApiStudio } from "./studio/ApiStudio";
import { Quality } from "./studio/Quality";
import { PipelineStudio } from "./studio/PipelineStudio";
import { lazy, Suspense } from "react";
const Analytics = lazy(() =>
  import("./studio/Analytics").then((m) => ({ default: m.Analytics })),
);
import { Brand, Modal, stepLabels, errorText, type T } from "./ui";
type Entry = { before: Table[]; ru: string; en: string; time: number };
// Shared immutable sheets count once across snapshots. Large jobs keep fewer undo states.
function historyWindow(entries: Entry[]) {
  const retained: Entry[] = [],
    seen = new Set<Table>();
  let cells = 0;
  for (const entry of entries.slice(0, 30)) {
    for (const sheet of entry.before)
      if (!seen.has(sheet)) {
        seen.add(sheet);
        cells += sheet.rows.length * sheet.cols.length;
      }
    if (cells > 5_000_000 && retained.length) break;
    retained.push(entry);
  }
  return retained;
}
type Dialog = { kind: string; id: string };
function read(key: string) {
  try {
    return localStorage.getItem("dm." + key);
  } catch {
    return null;
  }
}
function pref(key: string, v: string) {
  try {
    localStorage.setItem("dm." + key, v);
  } catch {
    /* Preferences are optional in private mode. */
  }
}
const nav = [
  { id: "home", ru: "Обзор", en: "Overview", Icon: LayoutDashboard },
  { id: "tables", ru: "Таблицы", en: "Tables", Icon: Table2 },
  { id: "analytics", ru: "Аналитика", en: "Analytics", Icon: BarChart3 },
  {
    id: "automation",
    ru: "Конструктор",
    en: "Workflow builder",
    Icon: Waypoints,
  },
  { id: "studio", ru: "API Studio", en: "API Studio", Icon: PlugZap },
  { id: "scenarios", ru: "Сценарии", en: "Scenarios", Icon: Workflow },
  {
    id: "quality",
    ru: "Качество данных",
    en: "Data quality",
    Icon: ScanSearch,
  },
  { id: "projects", ru: "Проекты", en: "Projects", Icon: FolderOpen },
  { id: "history", ru: "История", en: "History", Icon: History },
];
export default function App() {
  const manager = useProjects(),
    { project } = manager,
    { tables, recipes } = project;
  const setTables = (next: Table[]) => manager.patch({ tables: next });
  const setRecipes = (next: Recipe[]) => manager.patch({ recipes: next });
  const [future, setFuture] = useState<Entry[]>([]);
  const [hist, setHistory] = useState<Entry[]>([]),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [lang, setLanguage] = useState(read("lang") === "en" ? "en" : "ru"),
    [dark, setDark] = useState(read("theme") === "dark"),
    [side, setSidebar] = useState(false),
    [toast, setToast] = useState(""),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { view, sheet: active } = manager.location;
  const setView = (view: string) => manager.navigate({ view });
  const setActive = (sheet: string) => manager.navigate({ sheet });
  const t: T = (ru, en) => (lang === "ru" ? ru : en);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    pref("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    document.documentElement.lang = lang;
    pref("lang", lang);
  }, [lang]);
  useEffect(() => {
    if (!side) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebar(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [side]);
  function notify(s: string) {
    setToast(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4000);
  }
  const display = (a: Table) =>
    a.demo && demoNames[a.id] && a.name === demoNames[a.id][0]
      ? t(...demoNames[a.id])
      : a.name;
  const go = (v: string) => {
    setView(v);
    setSidebar(false);
    setDialog(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const open = (id: string) => {
    setActive(id);
    go("editor");
  };
  const selected = tables.find((a) => a.id === active),
    dTable = tables.find((a) => a.id === dialog?.id);
  function commit(next: Table[], ru: string, en: string) {
    if (
      next.length > 150 ||
      next.reduce(
        (total, item) => total + item.cols.length * item.rows.length,
        0,
      ) > 3_000_000
    )
      throw Error("projectLimit");
    setFuture([]);
    setHistory((h) =>
      historyWindow([{ before: tables, ru, en, time: Date.now() }, ...h]),
    );
    setTables(next);
  }
  function modify(a: Table, ru: string, en: string) {
    commit(
      tables.map((x) => (x.id === a.id ? { ...a, updated: Date.now() } : x)),
      ru + " · " + display(a),
      en + " · " + display(a),
    );
    notify(t(ru, en));
  }
  function undo() {
    if (!hist.length) return;
    const h = hist[0];
    setFuture((f) => [{ ...h, before: tables }, ...f]);
    setTables(h.before);
    setHistory(hist.slice(1));
    setDialog(null);
    if (view === "editor" && !h.before.some((x) => x.id === active))
      go("tables");
    notify(t("Операция отменена", "Operation undone"));
  }
  function redo() {
    const e = future[0];
    if (!e) return;
    setFuture(future.slice(1));
    setHistory((h) => historyWindow([{ ...e, before: tables }, ...h]));
    setTables(e.before);
    if (view === "editor" && !e.before.some((a) => a.id === active))
      go("tables");
    notify(t("Действие повторено", "Action redone"));
  }
  function projectChange(fn: () => void) {
    fn();
    setHistory([]);
    setFuture([]);
    setDialog(null);
  }
  async function launch(id: string) {
    try {
      const result = await launchSample(id, t("ru", "en") === "en");
      commit(
        [...result.tables, ...tables],
        "Бизнес-шаблон · " + result.tables[0].name,
        "Business template · " + result.tables[0].name,
      );
      setActive(result.primary);
      go(result.view);
      notify(t("Шаблон выполнен", "Template complete"));
    } catch (e) {
      notify(errorText(e, t));
    }
  }
  function processed(
    a: Table,
    g: import("./core").Grid,
    steps: Step[],
    ru: string,
    en: string,
  ) {
    if (
      Object.keys(a.meta?.formulas ?? {}).length ||
      Object.keys(a.meta?.styles ?? {}).length
    ) {
      const derived = {
        ...a,
        ...g,
        meta: undefined,
        id: crypto.randomUUID(),
        demo: false,
        name: display(a) + " · " + t(ru, en),
        updated: Date.now(),
        steps,
      };
      commit([derived, ...tables], ru, en);
      open(derived.id);
    } else {
      modify({ ...a, ...g, steps }, ru, en);
      open(a.id);
    }
  }
  function add(data: NewTable[], ru = "Импорт данных", en = "Imported data") {
    const added = data.map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      updated: Date.now(),
      steps: [],
    }));
    commit(
      [...added, ...tables],
      ru + " · " + added.map((a) => a.name).join(", "),
      en + " · " + added.map((a) => a.name).join(", "),
    );
    open(added[0].id);
    notify(t(ru, en) + " · " + added.length);
  }
  function saveRecipes(next: Recipe[]) {
    try {
      if (!manager.consent && project.id === manager.projects[0].id)
        localStorage.setItem("dm.recipes", JSON.stringify(next));
    } catch {
      throw Error("storage");
    }
    setRecipes(next);
  }
  function act(kind: string, id?: string) {
    setSidebar(false);
    if (
      !["newSheet", "import", "api", "recipe", "deleteRecipe"].includes(kind) &&
      !tables.length
    ) {
      notify(t("Сначала импортируйте таблицу", "Import a table first"));
      return;
    }
    if (["merge", "compare"].includes(kind) && tables.length < 2) {
      notify(
        t(
          "Для этой операции нужны две таблицы",
          "This operation needs two tables",
        ),
      );
      return;
    }
    setDialog({
      kind,
      id:
        id ?? (view === "editor" && selected ? active : (tables[0]?.id ?? "")),
    });
  }
  const ctx: DContext = { t, tables, recipes, display, go, act, open, launch };
  const current = nav.find((n) => n.id === view) ?? nav[1],
    close = () => setDialog(null),
    common = { t, close },
    base = {
      ...common,
      tables,
      initial: dTable?.id ?? tables[0]?.id ?? "",
      display,
    };
  const recipe =
    dialog?.kind === "recipe"
      ? templates.find((r) => r.id === dialog.id)
      : recipes.find((r) => r.id === dialog?.id);
  if (!manager.ready)
    return (
      <div className="emptywell">
        {t("Восстановление проекта…", "Restoring workspace…")}
      </div>
    );
  return (
    <div className="app studio2">
      <a className="skip" href="#main">
        {t("К содержимому", "Skip to content")}
      </a>
      {side && (
        <button
          className="backdrop"
          aria-label={t("Закрыть меню", "Close navigation")}
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={"sidebar " + (side ? "shown" : "")}>
        <button
          className="brandbutton"
          onClick={() => go("home")}
          aria-label="DataMaster"
        >
          <Brand />
        </button>
        <div className="sidenav">
          <p className="navcaption">{t("Рабочая область", "Workspace")}</p>
          <nav>
            {nav.map((n) => (
              <button
                aria-current={current.id === n.id ? "page" : undefined}
                key={n.id}
                className={"navitem " + (current.id === n.id ? "active" : "")}
                onClick={() => go(n.id)}
              >
                <n.Icon size={18} />
                <span>{t(n.ru, n.en)}</span>
                {n.id === "tables" && <small>{tables.length}</small>}
                {n.id === "scenarios" && (
                  <small>{templates.length + recipes.length}</small>
                )}
              </button>
            ))}
          </nav>
          <div className="navline" />
          <p className="navcaption">{t("Источники данных", "Data sources")}</p>
          <button className="navitem" onClick={() => act("import")}>
            <FileInput size={18} />
            {t("Импорт файлов", "Import files")}
          </button>
          <button className="navitem" onClick={() => act("api")}>
            <PlugZap size={18} />
            REST API
          </button>
        </div>
        <div className="sidebarbottom">
          <div className="localcard">
            <div>
              <span className="statusdot" />
              <b>{t("Локальный режим", "Local mode")}</b>
              <ShieldCheck size={15} />
            </div>
            <small>
              {manager.consent
                ? manager.status === "saved"
                  ? t("Сохранено на устройстве", "Saved on this device")
                  : manager.status === "saving"
                    ? t("Сохранение…", "Saving…")
                    : t(
                        "Состояние автосохранения · Проекты",
                        "Storage status · Projects",
                      )
                : t("Данные остаются в браузере", "Data stays in your browser")}
            </small>
          </div>
          <div className="sidefoot">
            <span className="minilogo">
              <Layers3 size={13} />
            </span>
            DataMaster Studio<span>v2.0</span>
          </div>
        </div>
      </aside>
      <div className="mainarea">
        <header className="topbar">
          <button
            className="iconbtn mobilemenu"
            aria-label={t("Открыть меню", "Open navigation")}
            onClick={() => setSidebar(true)}
          >
            <Menu size={21} />
          </button>
          <button
            className="mobilebrand"
            onClick={() => go("home")}
            aria-label="DataMaster Studio"
          >
            <Brand />
          </button>
          <div className="crumb">
            <PanelLeft size={16} />
            <i />
            <button onClick={() => go("home")}>
              {t("Рабочая область", "Workspace")}
            </button>
            <ChevronRight size={13} />
            <button className="current" onClick={() => go(current.id)}>
              {t(current.ru, current.en)}
            </button>
            {view === "editor" && (
              <>
                <ChevronRight size={13} />
                <strong>{t("Редактор", "Editor")}</strong>
              </>
            )}
          </div>
          <div className="topcontrols">
            <button className="project-switch" onClick={() => go("projects")}>
              <FolderOpen size={14} />
              {project.name}
              <Down size={12} />
            </button>
            <button
              className="language"
              title={t("Switch to English", "Переключить на русский")}
              onClick={() => setLanguage(lang === "ru" ? "en" : "ru")}
            >
              <Globe2 size={15} />
              {lang.toUpperCase()}
              <ChevronDown size={12} />
            </button>
            <i />
            <button
              className="iconbtn themebtn"
              aria-label={t("Сменить тему", "Switch theme")}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main id="main" className="maincontent">
          {(manager.status === "error" || manager.status === "conflict") && (
            <div role="alert" className="errorbox">
              {manager.status === "conflict"
                ? t(
                    "Проект изменён в другой вкладке. Экспортируйте эту сессию перед перезагрузкой.",
                    "The workspace changed in another tab. Export this session before reloading.",
                  )
                : t(
                    "Автосохранение приостановлено. Экспортируйте проект.",
                    "Autosave paused. Export your project.",
                  )}
            </div>
          )}
          {view === "home" ? (
            <Dashboard ctx={ctx} />
          ) : view === "editor" && selected ? (
            <Editor
              key={selected.id}
              a={selected}
              ctx={ctx}
              modify={modify}
              undo={undo}
              redo={redo}
              canRedo={!!future.length}
              canUndo={!!hist.length}
              notify={notify}
            />
          ) : view === "projects" ? (
            <ProjectManager
              manager={manager}
              t={t}
              change={projectChange}
              notify={notify}
            />
          ) : view === "studio" ? (
            <ApiStudio
              t={t}
              notify={notify}
              upsert={(g, name, id) => {
                const old = tables.find((s) => s.id === id);
                const sheet: Table = {
                  ...g,
                  id: old?.id ?? crypto.randomUUID(),
                  name,
                  steps: [],
                  format: "API",
                  updated: Date.now(),
                };
                commit(
                  old
                    ? tables.map((s) => (s.id === id ? sheet : s))
                    : [sheet, ...tables],
                  "Обновление API · " + name,
                  "API refresh · " + name,
                );
                return sheet.id;
              }}
            />
          ) : view === "automation" ? (
            <PipelineStudio
              t={t}
              tables={tables}
              active={active}
              display={display}
              notify={notify}
              pipelines={project.pipelines}
              savePipelines={(pipelines) => manager.patch({ pipelines })}
              commit={(outputs) => {
                const sheets = outputs.map((s) => ({
                  ...s,
                  id: crypto.randomUUID(),
                  format: s.format ?? "XLSX",
                  updated: Date.now(),
                  steps: [],
                }));
                commit(
                  [...sheets, ...tables],
                  "Сценарий · " + sheets.length,
                  "Workflow · " + sheets.length,
                );
              }}
            />
          ) : (view === "analytics" || view === "quality") && !tables.length ? (
            <div className="panel emptywell">
              <h2>{t("Нужен лист с данными", "A data sheet is required")}</h2>
              <button className="btn primary" onClick={() => act("import")}>
                {t("Импорт данных", "Import data")}
              </button>
            </div>
          ) : view === "analytics" ? (
            <Suspense
              fallback={
                <div className="emptywell">
                  {t("Открываем отчёт…", "Opening report…")}
                </div>
              }
            >
              <Analytics
                id={active}
                tables={tables}
                display={display}
                t={t}
                dark={dark}
                boards={project.boards}
                saveBoards={(boards) => manager.patch({ boards })}
                notify={notify}
              />
            </Suspense>
          ) : view === "quality" ? (
            <Quality id={active} tables={tables} display={display} t={t} />
          ) : (
            <>
              <div className="pagetitle">
                <div>
                  <h1>{t(current.ru, current.en)}</h1>
                  <p>
                    {view === "tables"
                      ? t(
                          "Управление данными текущей сессии",
                          "Manage this session’s datasets",
                        )
                      : view === "scenarios"
                        ? t(
                            "Повторяйте операции с таблицами в один запуск",
                            "Run a sequence of table operations in one click",
                          )
                        : t(
                            "Изменения текущей сессии · последние 30 операций",
                            "Session changes · last 30 operations",
                          )}
                  </p>
                </div>
                {view === "tables" && (
                  <div className="buttonrow">
                    <button className="btn" onClick={() => act("newSheet")}>
                      <Plus size={15} />
                      {t("Создать лист", "Create sheet")}
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => act("import")}
                    >
                      <Upload size={16} />
                      {t("Импорт данных", "Import data")}
                    </button>
                  </div>
                )}
                {view === "history" && (
                  <button
                    className="btn"
                    disabled={!hist.length}
                    onClick={undo}
                  >
                    <Undo2 size={16} />
                    {t("Отменить последнюю", "Undo latest")}
                  </button>
                )}
              </div>
              {view === "tables" ? (
                <TableList ctx={ctx} all />
              ) : view === "scenarios" ? (
                <>
                  <BusinessGallery t={t} launch={launch} />
                  <Scenarios ctx={ctx} all />
                </>
              ) : (
                <div className="panel historylist">
                  {hist.length ? (
                    hist.map((h, i) => (
                      <div key={h.time + "-" + i}>
                        <span className="metricicon periwinkle">
                          <Clock3 size={17} />
                        </span>
                        <strong>{t(h.ru, h.en)}</strong>
                        <small>
                          {new Date(h.time).toLocaleTimeString(lang, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                    ))
                  ) : (
                    <div className="empty historyempty">
                      <History size={30} />
                      <h3>{t("История пока пуста", "No operations yet")}</h3>
                      <p>
                        {t(
                          "Здесь появятся импорт, изменения таблиц и запуски сценариев.",
                          "Imports, table edits and scenario runs will appear here.",
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {dialog && (
        <div key={dialog.kind + "-" + dialog.id}>
          {["import", "api"].includes(dialog.kind) && (
            <ImportDialog
              {...common}
              api={dialog.kind === "api"}
              save={(ts) => add(ts)}
            />
          )}
          {Object.hasOwn(stepLabels, dialog.kind) && dTable && (
            <OpDialog
              {...base}
              kind={dialog.kind as Step["kind"]}
              save={(a, s, g) => {
                processed(a, g, [...a.steps, s], ...stepLabels[s.kind]);
              }}
            />
          )}
          {["merge", "compare"].includes(dialog.kind) && (
            <CombineDialog
              {...base}
              compare={dialog.kind === "compare"}
              save={(ts) => add(ts, "Создана таблица", "Created table")}
            />
          )}
          {["recipe", "saved"].includes(dialog.kind) && recipe && (
            <RecipeDialog
              {...base}
              item={recipe}
              save={(a, g, name, fresh, steps) => {
                if (fresh) {
                  const result = {
                    ...a,
                    ...g,
                    steps,
                    id: crypto.randomUUID(),
                    name,
                    demo: false,
                    updated: Date.now(),
                  };
                  commit(
                    [result, ...tables],
                    "Запуск · " + name,
                    "Run · " + name,
                  );
                  open(result.id);
                } else {
                  processed(
                    a,
                    g,
                    [...a.steps, ...steps],
                    "Сценарий · " + name,
                    "Scenario · " + name,
                  );
                }
                notify(t("Сценарий выполнен", "Scenario complete"));
              }}
            />
          )}
          {dTable && dialog.kind === "export" && (
            <ExportDialog
              {...common}
              a={dTable}
              name={display(dTable)}
              done={() => {
                close();
                notify(
                  t("Файл подготовлен к скачиванию", "File ready to download"),
                );
              }}
            />
          )}
          {dTable && dialog.kind === "saveRecipe" && (
            <NameDialog
              {...common}
              scenario
              title={t("Сохранить сценарий", "Save scenario")}
              save={(name) => {
                saveRecipes([
                  ...recipes,
                  { id: crypto.randomUUID(), name, steps: dTable.steps },
                ]);
                close();
                notify(t("Сценарий сохранён", "Scenario saved"));
              }}
            />
          )}
          {dialog.kind === "newSheet" && (
            <NameDialog
              {...common}
              title={t("Создать пустой лист", "Create blank sheet")}
              initial={t("Лист ", "Sheet ") + (tables.length + 1)}
              save={(name) => {
                const a = blankSheet(name);
                commit(
                  [a, ...tables],
                  "Создан лист · " + name,
                  "Created sheet · " + name,
                );
                open(a.id);
              }}
            />
          )}
          {dTable && dialog.kind === "duplicate" && (
            <NameDialog
              {...common}
              title={t("Копировать лист", "Duplicate sheet")}
              initial={display(dTable) + " (" + t("копия", "copy") + ")"}
              save={(name) => {
                const a = {
                  ...dTable,
                  meta: { ...dTable.meta, tabName: name },
                  id: crypto.randomUUID(),
                  name,
                  demo: false,
                  updated: Date.now(),
                };
                commit(
                  [a, ...tables],
                  "Копия листа · " + name,
                  "Duplicated sheet · " + name,
                );
                open(a.id);
              }}
            />
          )}
          {dTable && dialog.kind === "rename" && (
            <NameDialog
              {...common}
              title={t("Переименовать таблицу", "Rename table")}
              initial={display(dTable)}
              save={(name) => {
                modify(
                  { ...dTable, name, meta: { ...dTable.meta, tabName: name } },
                  "Таблица переименована",
                  "Renamed table",
                );
                close();
              }}
            />
          )}
          {dTable && dialog.kind === "tablemenu" && (
            <Modal {...common} title={display(dTable)}>
              <div className="actionmenu">
                {[
                  {
                    kind: "open",
                    I: Table2,
                    label: t("Открыть таблицу", "Open table"),
                  },
                  {
                    kind: "export",
                    I: Download,
                    label: t("Экспорт", "Export"),
                  },
                  {
                    kind: "duplicate",
                    I: CopyPlus,
                    label: t("Копировать лист", "Duplicate sheet"),
                  },
                  {
                    kind: "rename",
                    I: Pencil,
                    label: t("Переименовать", "Rename"),
                  },
                  {
                    kind: "delete",
                    I: Trash2,
                    label: t("Удалить таблицу", "Delete table"),
                  },
                ].map((x) => (
                  <button
                    key={x.kind}
                    onClick={() =>
                      x.kind === "open"
                        ? open(dTable.id)
                        : act(x.kind, dTable.id)
                    }
                  >
                    <x.I size={17} />
                    {x.label}
                  </button>
                ))}
              </div>
            </Modal>
          )}
          {(dialog.kind === "delete" || dialog.kind === "deleteRecipe") && (
            <Modal
              {...common}
              title={t("Подтвердите удаление", "Confirm deletion")}
            >
              <p className="dialogdesc">
                {dTable
                  ? display(dTable)
                  : recipe && "name" in recipe
                    ? recipe.name
                    : ""}
              </p>
              <div className="modalfoot">
                <button className="btn" onClick={close}>
                  {t("Отмена", "Cancel")}
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    if (dialog.kind === "deleteRecipe") {
                      try {
                        saveRecipes(recipes.filter((r) => r.id !== dialog.id));
                      } catch {
                        notify(
                          t(
                            "Не удалось сохранить изменения",
                            "Could not save changes",
                          ),
                        );
                        return;
                      }
                    } else if (dTable) {
                      commit(
                        tables.filter((a) => a.id !== dTable.id),
                        "Удалена таблица · " + display(dTable),
                        "Deleted table · " + display(dTable),
                      );
                      if (view === "editor") go("tables");
                    }
                    close();
                    notify(t("Удалено", "Deleted"));
                  }}
                >
                  {t("Удалить", "Delete")}
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label={t("Закрыть", "Dismiss")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
