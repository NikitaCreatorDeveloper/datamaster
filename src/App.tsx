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
} from "lucide-react";
import { seeds, demoNames, templates } from "./demo";
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
import { Brand, Modal, stepLabels, type T } from "./ui";
type Entry = { before: Table[]; ru: string; en: string; time: number };
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
function loadRecipes(): Recipe[] {
  try {
    const data = JSON.parse(read("recipes") || "[]");
    return Array.isArray(data)
      ? data.filter(
          (r) =>
            typeof r?.name === "string" &&
            typeof r.id === "string" &&
            Array.isArray(r.steps) &&
            r.steps.every(
              (s: Step) =>
                s &&
                Object.hasOwn(stepLabels, s.kind) &&
                typeof s.col === "string",
            ),
        )
      : [];
  } catch {
    return [];
  }
}
const nav = [
  { id: "home", ru: "Обзор", en: "Overview", Icon: LayoutDashboard },
  { id: "tables", ru: "Таблицы", en: "Tables", Icon: Table2 },
  { id: "scenarios", ru: "Сценарии", en: "Scenarios", Icon: Workflow },
  { id: "history", ru: "История", en: "History", Icon: History },
];
export default function App() {
  const [tables, setTables] = useState<Table[]>(seeds),
    [recipes, setRecipes] = useState<Recipe[]>(loadRecipes),
    [hist, setHistory] = useState<Entry[]>([]),
    [view, setView] = useState("home"),
    [active, setActive] = useState("catalog"),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [lang, setLanguage] = useState(read("lang") === "en" ? "en" : "ru"),
    [dark, setDark] = useState(read("theme") === "dark"),
    [side, setSidebar] = useState(false),
    [toast, setToast] = useState(""),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    setHistory((h) =>
      [{ before: tables, ru, en, time: Date.now() }, ...h].slice(0, 30),
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
    setTables(h.before);
    setHistory(hist.slice(1));
    setDialog(null);
    if (view === "editor" && !h.before.some((x) => x.id === active))
      go("tables");
    notify(t("Операция отменена", "Operation undone"));
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
      localStorage.setItem("dm.recipes", JSON.stringify(next));
    } catch {
      throw Error("storage");
    }
    setRecipes(next);
  }
  function act(kind: string, id?: string) {
    setSidebar(false);
    if (
      !["import", "api", "recipe", "deleteRecipe"].includes(kind) &&
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
  const ctx: DContext = { t, tables, recipes, display, go, act, open };
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
  return (
    <div className="app">
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
              {t("Данные остаются в браузере", "Data stays in your browser")}
            </small>
          </div>
          <div className="sidefoot">
            <span className="minilogo">
              <Layers3 size={13} />
            </span>
            DataMaster Studio<span>v1.0</span>
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
          {view === "home" ? (
            <Dashboard ctx={ctx} />
          ) : view === "editor" && selected ? (
            <Editor
              key={selected.id}
              a={selected}
              ctx={ctx}
              modify={modify}
              undo={undo}
              canUndo={!!hist.length}
              notify={notify}
            />
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
                  <button className="btn primary" onClick={() => act("import")}>
                    <Upload size={16} />
                    {t("Импорт данных", "Import data")}
                  </button>
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
                <Scenarios ctx={ctx} all />
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
                modify(
                  { ...a, ...g, steps: [...a.steps, s] },
                  ...stepLabels[s.kind],
                );
                open(a.id);
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
                  modify(
                    { ...a, ...g, steps: [...a.steps, ...steps] },
                    "Сценарий · " + name,
                    "Scenario · " + name,
                  );
                  open(a.id);
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
          {dTable && dialog.kind === "rename" && (
            <NameDialog
              {...common}
              title={t("Переименовать таблицу", "Rename table")}
              initial={display(dTable)}
              save={(name) => {
                modify(
                  { ...dTable, name },
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
