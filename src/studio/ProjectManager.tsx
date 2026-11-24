import { useState, useRef } from "react";
import {
  FolderPlus,
  Upload,
  Download,
  FolderOpen,
  Trash2,
  FileSpreadsheet,
  HardDrive,
} from "lucide-react";
import { type T, Modal, errorText, ErrorBox } from "../ui";
import {
  freshProject,
  projectFile,
  type Project,
  type useProjects,
} from "./projects";
import { saveBlob, saveJSON } from "./download";
import { Field } from "./widgets";
import { background } from "./worker";
export function ProjectManager({
  manager: m,
  t,
  change,
  notify,
}: {
  manager: ReturnType<typeof useProjects>;
  t: T;
  change: (f: () => void) => void;
  notify: (s: string) => void;
}) {
  const [dialog, D] = useState(""),
    [name, N] = useState(""),
    [err, E] = useState(""),
    [busy, B] = useState(false),
    ref = useRef<HTMLInputElement>(null);
  async function action(fn: () => Promise<void>) {
    B(true);
    E("");
    try {
      await fn();
    } catch (e) {
      E(errorText(e, t));
    } finally {
      B(false);
    }
  }
  return (
    <>
      <div className="pagetitle">
        <div>
          <h1>{t("Проекты", "Projects")}</h1>
          <p>
            {t(
              "Книги, сценарии и панели в одном рабочем пространстве",
              "Workbooks, workflows and dashboards in one workspace",
            )}
          </p>
        </div>
        <div className="buttonrow">
          <button className="btn" onClick={() => ref.current?.click()}>
            <Upload size={16} />
            {t("Импорт проекта", "Import project")}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              D("new");
              N("");
            }}
          >
            <FolderPlus size={16} />
            {t("Создать проект", "Create project")}
          </button>
        </div>
      </div>
      <input
        hidden
        ref={ref}
        type="file"
        accept=".json"
        aria-label={t("Файл проекта", "Project file")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          e.target.value = "";
          void action(async () => {
            const p = await background<Project>({
              op: "projectImport",
              file: f,
            });
            p.id = crypto.randomUUID();
            change(() => m.add(p));
            notify(t("Проект импортирован", "Project imported"));
          });
        }}
      />
      <div className="panel storagebanner">
        <span className="metricicon mint">
          <HardDrive size={20} />
        </span>
        <div>
          <h3>{t("Локальное автосохранение", "Local autosave")}</h3>
          <p>
            {m.consent
              ? t(
                  "Проекты восстанавливаются из IndexedDB этого браузера.",
                  "Projects restore from IndexedDB in this browser.",
                )
              : t(
                  "Сейчас данные хранятся в памяти вкладки.",
                  "Data currently lives in tab memory.",
                )}
          </p>
        </div>
        <button
          disabled={busy}
          className="btn"
          onClick={() => D(m.consent ? "forget" : "consent")}
        >
          {m.consent
            ? t("Отключить", "Turn off")
            : t("Разрешить сохранение", "Allow storage")}
        </button>
      </div>
      <div className="projectgrid">
        {m.projects.map((p) => (
          <article
            className={
              "panel projectcard " + (p.id === m.project.id ? "current" : "")
            }
            key={p.id}
          >
            <div className="projecticon">
              <FolderOpen size={24} />
            </div>
            <h2>{p.name}</h2>
            <p>
              {t("Листов", "Sheets")} {p.tables.length} ·{" "}
              {t("Сценариев", "Workflows")}{" "}
              {p.pipelines.length + p.recipes.length} ·{" "}
              {t("Панелей", "Dashboards")} {p.boards.length}
            </p>
            <div className="buttonrow">
              <button
                className="btn"
                disabled={p.id === m.project.id}
                onClick={() => change(() => m.select(p.id))}
              >
                {p.id === m.project.id
                  ? t("Текущий проект", "Current project")
                  : t("Открыть", "Open")}
              </button>
              <button
                className="iconbtn"
                title={t("Экспорт проекта", "Export project")}
                aria-label={t("Экспорт проекта ", "Export project ") + p.name}
                onClick={() =>
                  saveJSON(projectFile(p), p.name + ".datamaster.json")
                }
              >
                <Download size={16} />
              </button>
              <button
                className="iconbtn"
                disabled={!p.tables.length || busy}
                title={t(
                  "Книга XLSX со всеми листами",
                  "XLSX workbook with all sheets",
                )}
                aria-label={
                  t("Скачать книгу XLSX ", "Download workbook ") + p.name
                }
                onClick={() =>
                  action(async () =>
                    saveBlob(
                      await background<Blob>({ op: "book", tables: p.tables }),
                      p.name + ".xlsx",
                    ),
                  )
                }
              >
                <FileSpreadsheet size={16} />
              </button>
              <button
                className="iconbtn"
                title={t("Удалить проект", "Delete project")}
                aria-label={t("Удалить проект ", "Delete project ") + p.name}
                onClick={() => D("remove:" + p.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <ErrorBox message={err} />
      {dialog && (
        <Modal
          title={
            dialog === "new"
              ? t("Создать проект", "Create project")
              : dialog === "consent"
                ? t(
                    "Разрешить хранение на устройстве?",
                    "Allow storage on this device?",
                  )
                : dialog === "forget"
                  ? t("Удалить локальную копию?", "Remove the local copy?")
                  : t("Удалить проект?", "Delete project?")
          }
          close={() => D("")}
        >
          {dialog === "new" ? (
            <Field label={t("Название проекта", "Project name")}>
              <input
                value={name}
                maxLength={80}
                onChange={(e) => N(e.target.value)}
              />
            </Field>
          ) : (
            <p className="dialogdesc">
              {dialog === "consent"
                ? t(
                    "Листы всех открытых проектов, формулы, сценарии и настройки отчётов будут автоматически сохраняться в IndexedDB. Это устройство сможет восстановить их при следующем запуске.",
                    "All open projects, sheets, formulas, workflows and reports will be saved automatically to IndexedDB and restored on this device.",
                  )
                : dialog === "forget"
                  ? t(
                      "Все сохранённые проекты будут удалены из IndexedDB. Открытая сессия останется доступна до закрытия вкладки.",
                      "All saved projects will be removed from IndexedDB. This session stays in memory until the tab closes.",
                    )
                  : m.projects.find((p) => "remove:" + p.id === dialog)?.name}
            </p>
          )}
          <div className="modalfoot">
            <button className="btn" onClick={() => D("")}>
              {t("Отмена", "Cancel")}
            </button>
            <button
              className="btn primary"
              disabled={busy || (dialog === "new" && !name.trim())}
              onClick={() =>
                action(async () => {
                  if (dialog === "new")
                    change(() => m.add(freshProject(name.trim())));
                  else if (dialog === "consent" || dialog === "forget")
                    await m.saving(dialog === "consent");
                  else change(() => m.remove(dialog.slice(7)));
                  D("");
                })
              }
            >
              {dialog === "new"
                ? t("Создать", "Create")
                : dialog === "consent"
                  ? t("Разрешить", "Allow")
                  : t("Удалить", "Delete")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
