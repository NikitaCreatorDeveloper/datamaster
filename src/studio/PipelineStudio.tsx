import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Eye,
  Trash2,
  ChevronUp,
  ChevronDown,
  Database,
  Workflow,
  Download,
  Upload,
  Save,
  Check,
  SlidersHorizontal,
  Files,
} from "lucide-react";
import { type Table } from "../core";
import { stepLabels, type T, Modal, errorText, ErrorBox } from "../ui";
import { type Pipeline, type Stage } from "./model";
import { decodePipeline, pipelineFile } from "./projects";
import { background } from "./worker";
import { saveBlob, saveJSON, readJsonFile } from "./download";
import { Field, Choice, PreviewGrid } from "./widgets";
import type { InputTable, Progress } from "./tasks";
export const stageLabels: Record<Stage["kind"], [string, string]> = {
  ...stepLabels,
  normalize: ["Нормализация", "Normalize"],
  empty: ["Удалить пустые", "Remove blanks"],
  split: ["Разделить столбец", "Split column"],
  concat: ["Объединить столбцы", "Combine columns"],
  profit: ["Расчёт прибыли", "Calculate profit"],
  pivot: ["Сводная таблица", "Pivot table"],
  export: ["Экспорт результата", "Export result"],
};
function initialStep(kind: Stage["kind"], cols: string[], t: T): Stage {
  const col = cols[0] || "A",
    other = cols[1] || col,
    target = t("Результат", "Result");
  switch (kind) {
    case "dedupe":
    case "empty":
      return { kind, col: "" };
    case "sort":
      return { kind, col, desc: false };
    case "filter":
      return { kind, col, op: "filled", value: "" };
    case "price":
      return {
        kind,
        col: cols.find((x) => /цена|price|cost/i.test(x)) || col,
        target,
        percent: 15,
      };
    case "markup":
      return { kind, col, sale: other, target };
    case "replace":
      return { kind, col, find: "", value: "" };
    case "normalize":
      return { kind, col, mode: "text" };
    case "split":
      return {
        kind,
        col,
        separator: " ",
        left: t("Часть 1", "Part 1"),
        right: t("Часть 2", "Part 2"),
      };
    case "concat":
      return { kind, col, other, separator: " ", target };
    case "profit":
      return { kind, col, cost: other, target: t("Прибыль", "Profit") };
    case "pivot":
      return { kind, col, measure: other, agg: "sum" };
    case "export":
      return { kind, format: "CSV" };
  }
}
function columnsAfter(cols: string[], stages: Stage[]) {
  let out = cols.slice();
  for (const s of stages) {
    if (s.kind === "pivot") out = [s.col, s.measure];
    if ("target" in s) out.push(s.target);
    if (s.kind === "split") out.push(s.left, s.right);
    out = [...new Set(out)];
  }
  return out;
}
function Settings({
  s,
  cols,
  change,
  t,
}: {
  s: Stage;
  cols: string[];
  change: (s: Stage) => void;
  t: T;
}) {
  const upd = (key: string, value: unknown) =>
    change({ ...s, [key]: value } as Stage);
  const f = (key: string, label: string) => (
    <Field label={label}>
      <input
        value={String((s as unknown as Record<string, unknown>)[key] ?? "")}
        onChange={(e) => upd(key, e.target.value)}
      />
    </Field>
  );
  const sel = (key: string, label: string, values: Record<string, string>) => (
    <Field label={label}>
      <select
        value={String((s as unknown as Record<string, unknown>)[key])}
        onChange={(e) => upd(key, e.target.value)}
      >
        {Object.entries(values).map(([k, v]) => (
          <option value={k} key={k}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <div className="stagefields">
      <Field label={t("Тип шага", "Step type")}>
        <select
          value={s.kind}
          onChange={(e) =>
            change(initialStep(e.target.value as Stage["kind"], cols, t))
          }
        >
          {Object.entries(stageLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {t(...v)}
            </option>
          ))}
        </select>
      </Field>
      {"col" in s && (
        <Choice
          label={t("Исходный столбец", "Source column")}
          value={s.col}
          options={cols}
          blank={
            s.kind === "dedupe" || s.kind === "empty"
              ? t("Вся строка", "Whole row")
              : undefined
          }
          change={(v) => upd("col", v)}
        />
      )}
      {"target" in s && f("target", t("Столбец результата", "Output column"))}
      {s.kind === "normalize" &&
        sel("mode", t("Нормализовать", "Normalize as"), {
          text: t("Пробелы и Unicode", "Spaces and Unicode"),
          number: t("Числа", "Numbers"),
          phone: t("Телефоны", "Phones"),
          date: t("Даты ISO", "ISO dates"),
        })}
      {s.kind === "sort" && (
        <Field label={t("Порядок", "Order")}>
          <select
            value={s.desc ? "desc" : "asc"}
            onChange={(e) => upd("desc", e.target.value === "desc")}
          >
            <option value="asc">{t("По возрастанию", "Ascending")}</option>
            <option value="desc">{t("По убыванию", "Descending")}</option>
          </select>
        </Field>
      )}
      {s.kind === "filter" &&
        sel("op", t("Условие", "Condition"), {
          contains: t("Содержит", "Contains"),
          equal: "=",
          gt: ">",
          lt: "<",
          filled: t("Заполнен", "Populated"),
        })}
      {s.kind === "replace" && f("find", t("Найти", "Find"))}
      {(s.kind === "replace" || (s.kind === "filter" && s.op !== "filled")) &&
        f("value", t("Значение", "Value"))}
      {s.kind === "price" && (
        <Field label={t("Наценка, %", "Markup, %")}>
          <input
            type="number"
            step="any"
            value={s.percent}
            onChange={(e) => upd("percent", Number(e.target.value))}
          />
        </Field>
      )}
      {s.kind === "split" && (
        <>
          {f("left", t("Левый столбец", "Left column"))}
          {f("right", t("Правый столбец", "Right column"))}
        </>
      )}
      {"separator" in s && f("separator", t("Разделитель", "Delimiter"))}
      {("cost" in s || "sale" in s || "other" in s || "measure" in s) && (
        <Choice
          label={t("Второй столбец", "Second column")}
          options={cols}
          value={
            "cost" in s
              ? s.cost
              : "sale" in s
                ? s.sale
                : "other" in s
                  ? s.other
                  : s.measure
          }
          change={(v) =>
            upd(
              "cost" in s
                ? "cost"
                : "sale" in s
                  ? "sale"
                  : "other" in s
                    ? "other"
                    : "measure",
              v,
            )
          }
        />
      )}
      {s.kind === "pivot" &&
        sel("agg", t("Агрегация", "Aggregation"), {
          sum: t("Сумма", "Sum"),
          mean: t("Среднее", "Average"),
          count: t("Количество", "Count"),
          min: "MIN",
          max: "MAX",
        })}
      {s.kind === "export" &&
        sel("format", t("Формат", "Format"), {
          XLSX: "Excel (.xlsx)",
          CSV: "CSV",
          JSON: "JSON",
        })}
    </div>
  );
}
export function PipelineStudio({
  tables,
  active,
  pipelines,
  savePipelines,
  commit,
  t,
  notify,
  display,
}: {
  tables: Table[];
  active: string;
  pipelines: Pipeline[];
  savePipelines: (p: Pipeline[]) => void;
  commit: (g: InputTable[]) => void;
  t: T;
  notify: (m: string) => void;
  display: (a: Table) => string;
}) {
  const [source, Source] = useState("sheet"),
    [ids, Ids] = useState([
      tables.find((s) => s.id === active)?.id ?? tables[0]?.id ?? "",
    ]),
    [files, FilesSet] = useState<InputTable[]>([]),
    [combine, Combine] = useState(false),
    [mappings, Mappings] = useState<Record<string, string[]>>({}),
    [stages, Steps] = useState<Stage[]>([{ kind: "dedupe", col: "" }]),
    [selected, Select] = useState(0),
    [title, Title] = useState(t("Новый сценарий", "New workflow")),
    [current, Current] = useState(""),
    [progress, Prog] = useState<Progress[]>([]),
    [running, Run] = useState(false),
    [out, Out] = useState<InputTable[] | null>(null),
    [complete, Complete] = useState(false),
    [err, E] = useState(""),
    [log, Log] = useState<string[]>([]),
    [mapping, MapOpen] = useState(false);
  const savedFiles = useRef<Pipeline["source"]>(undefined);
  const abort = useRef<AbortController | null>(null),
    fileRef = useRef<HTMLInputElement>(null),
    recipeRef = useRef<HTMLInputElement>(null),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      abort.current?.abort();
    };
  }, []);
  const inputs =
      source === "files"
        ? files
        : ids
            .map((id) => tables.find((a) => a.id === id))
            .filter((x): x is Table => !!x)
            .map((s) => ({ ...s, name: display(s) })),
    merged = combine && inputs.length > 1,
    cols = merged
      ? [...new Set(inputs.flatMap((g, i) => mappings[i] ?? g.cols))]
      : (inputs[0]?.cols ?? []);
  const stamp = ids.join("|") + "~" + tables.map((s) => s.updated).join("|");
  useEffect(() => {
    Out(null);
    Complete(false);
    Prog([]);
    E("");
  }, [source, stamp, files, combine, mappings, stages]);
  function record(s: string) {
    Log((log) =>
      [new Date().toLocaleTimeString(t("ru", "en")) + "  " + s, ...log].slice(
        0,
        40,
      ),
    );
  }
  function fileMappings(inputs: InputTable[], saved: Pipeline["source"]) {
    const restored: Record<string, string[]> = {};
    if (!saved?.columns || !saved.mappings) return restored;
    const signatures = saved.columns.map((cols) => JSON.stringify(cols));
    inputs.forEach((input, i) => {
      const signature = JSON.stringify(input.cols);
      const first = signatures.indexOf(signature);
      const from =
        signatures[i] === signature
          ? i
          : first === signatures.lastIndexOf(signature)
            ? first
            : -1;
      if (from >= 0 && saved.mappings?.[from])
        restored[i] = saved.mappings[from];
    });
    return restored;
  }
  function open(p: Pipeline) {
    Steps(p.stages);
    Current(p.id);
    Title(p.name);
    Select(0);
    savedFiles.current = p.source?.mode === "files" ? p.source : undefined;
    if (p.source?.mode === "files") {
      Source("files");
      Combine(p.source.combine);
      Mappings(fileMappings(files, p.source));
      return;
    }
    if (p.source) {
      const valid = p.source.ids.filter((id) =>
        tables.some((a) => a.id === id),
      );
      if (valid.length) {
        Source(valid.length > 1 ? "sheets" : "sheet");
        Ids(valid);
        Combine(p.source.combine);
        Mappings(p.source.mappings ?? {});
      }
    }
  }
  function pipeline(): Pipeline {
    return {
      id: current || crypto.randomUUID(),
      name: title.trim() || t("Сценарий", "Workflow"),
      stages,
      source:
        source === "files"
          ? {
              mode: "files",
              ids: [],
              combine,
              columns: files.length
                ? files.map((f) => f.cols)
                : savedFiles.current?.columns,
              mappings: files.length ? mappings : savedFiles.current?.mappings,
            }
          : { ids, combine: merged, mappings },
    };
  }
  function add(kind: Stage["kind"]) {
    if (stages.length >= 60) return;
    const at = stages.findIndex((s) => s.kind === "export"),
      i = at < 0 ? stages.length : at;
    Steps([
      ...stages.slice(0, i),
      initialStep(kind, columnsAfter(cols, stages.slice(0, i)), t),
      ...stages.slice(i),
    ]);
    Select(i);
  }
  async function run(until = stages.length) {
    if (!inputs.length || !stages.length) return;
    const ac = new AbortController();
    abort.current = ac;
    Run(true);
    Prog([]);
    E("");
    Out(null);
    Complete(false);
    record(t("Запуск", "Run started"));
    try {
      if (stages.slice(0, -1).some((s) => s.kind === "export"))
        throw Error("exportLast");
      const results = await background<InputTable[]>(
        {
          op: "pipeline",
          inputs,
          stages: stages.slice(0, until),
          combine: merged,
          mappings,
        },
        ac.signal,
        (p) => {
          if (live.current) {
            Prog((list) => [...list.slice(-59), p]);
            record(
              p.name +
                " · " +
                p.done +
                "/" +
                p.total +
                " · " +
                p.rows +
                " " +
                t("строк", "rows"),
            );
          }
        },
      );
      if (live.current) {
        Out(results);
        Complete(until === stages.length);
        record(t("Расчёт завершён", "Processing complete"));
      }
    } catch (e) {
      if (live.current) {
        const reason = errorText(e, t);
        E(reason);
        record(reason);
      }
    } finally {
      if (live.current) Run(false);
      abort.current = null;
    }
  }
  async function apply() {
    if (!out || !complete) return;
    const ac = new AbortController();
    abort.current = ac;
    Run(true);
    E("");
    try {
      const exportStep = stages.at(-1);
      if (exportStep?.kind === "export") {
        const fmt = exportStep.format;
        if (out.length === 1)
          saveBlob(
            await background<Blob>(
              { op: "encode", grid: out[0], format: fmt },
              ac.signal,
            ),
            out[0].name + "." + fmt.toLowerCase(),
          );
        else {
          const { default: JSZip } = await import("jszip"),
            zip = new JSZip();
          for (const [i, g] of out.entries()) {
            const blob = await background<Blob>(
              {
                op: "encode",
                grid: g,
                format: fmt,
              },
              ac.signal,
            );
            zip.file(
              i +
                1 +
                "-" +
                g.name.replace(/[^\p{L}\p{N}_-]/gu, "_") +
                "." +
                fmt.toLowerCase(),
              await blob.arrayBuffer(),
            );
          }
          const blob = await zip.generateAsync({ type: "blob" });
          ac.signal.throwIfAborted();
          saveBlob(blob, title + ".zip");
        }
      }
      ac.signal.throwIfAborted();
      commit(out.map((g) => ({ ...g, name: title + " · " + g.name })));
      Out(null);
      record(
        t("Результаты добавлены в проект", "Result sheets added to project"),
      );
      notify(t("Сценарий применён", "Workflow applied"));
    } catch (e) {
      if (live.current) {
        const message = errorText(ac.signal.aborted ? Error("abort") : e, t);
        E(message);
        record(message);
      }
    } finally {
      abort.current = null;
      if (live.current) Run(false);
    }
  }
  async function importFiles(fs: FileList | null) {
    if (!fs?.length) return;
    const ac = new AbortController();
    abort.current = ac;
    Run(true);
    try {
      const result = await background<InputTable[]>(
        {
          op: "import",
          files: Array.from(fs),
        },
        ac.signal,
      );
      FilesSet(result);
      Mappings(fileMappings(result, savedFiles.current));
      Source("files");
    } catch (e) {
      if (live.current) {
        const message = errorText(ac.signal.aborted ? Error("abort") : e, t);
        E(message);
        record(message);
      }
    } finally {
      abort.current = null;
      if (live.current) Run(false);
    }
  }
  const cur = stages[selected];
  return (
    <>
      <div className="pagetitle">
        <div>
          <h1>{t("Конструктор сценариев", "Workflow builder")}</h1>
          <p>
            {t(
              "Соберите шаги, проверьте результат и примените к файлам",
              "Arrange the steps, preview results and process your files",
            )}
          </p>
        </div>
        <div className="buttonrow">
          <button
            className="btn"
            disabled={running}
            onClick={() => recipeRef.current?.click()}
          >
            <Upload size={15} />
            {t("Импорт сценария", "Import workflow")}
          </button>
          <button
            className="btn"
            disabled={!stages.length}
            onClick={() =>
              saveJSON(pipelineFile(pipeline()), title + ".workflow.json")
            }
          >
            <Download size={15} />
            JSON
          </button>
        </div>
      </div>
      <input
        ref={recipeRef}
        hidden
        type="file"
        accept=".json"
        aria-label={t("JSON сценария", "Workflow JSON")}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            try {
              const p = decodePipeline(await readJsonFile(f, 1024 * 1024));
              open(p);
              notify(t("Сценарий загружен", "Workflow loaded"));
            } catch (er) {
              E(errorText(er, t));
            }
        }}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".csv,.xlsx,.json"
        aria-label={t("Файлы пакета", "Batch files")}
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <fieldset disabled={running} className="pipelineconfig">
        <div className="panel studio-panel pipetop">
          <Field label={t("Название сценария", "Workflow name")}>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => Title(e.target.value)}
            />
          </Field>
          <Field label={t("Библиотека", "Library")}>
            <select
              value={current}
              onChange={(e) => {
                const p = pipelines.find((p) => p.id === e.target.value);
                if (p) open(p);
                else {
                  Title(t("Новый сценарий", "New workflow"));
                  Current("");
                  Steps([{ kind: "dedupe", col: "" }]);
                  Select(0);
                }
              }}
            >
              <option value="">{t("Новый сценарий", "New workflow")}</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn"
            disabled={!title.trim() || !stages.length}
            onClick={() => {
              try {
                const p = pipeline();
                decodePipeline(pipelineFile(p));
                savePipelines([...pipelines.filter((v) => v.id !== p.id), p]);
                Current(p.id);
                notify(
                  t("Сценарий сохранён в проекте", "Workflow saved to project"),
                );
              } catch (e) {
                E(errorText(e, t));
              }
            }}
          >
            <Save size={15} />
            {t("Сохранить", "Save")}
          </button>
        </div>
        <div className="flow-layout">
          <section className="panel studio-panel flowlist">
            <div className="panelhead">
              <h2>{t("Последовательность", "Sequence")}</h2>
              <Workflow size={18} />
            </div>
            <div className="flow-source">
              <Database size={19} />
              <span>{t("Источник данных", "Data source")}</span>
              <b>{inputs.length}</b>
            </div>
            <select
              aria-label={t("Тип источника", "Source type")}
              value={source}
              onChange={(e) => {
                Source(e.target.value);
                Mappings({});
                if (e.target.value === "sheet") Ids(ids.slice(0, 1));
              }}
            >
              <option value="sheet">{t("Один лист", "One sheet")}</option>
              <option value="sheets">
                {t("Несколько листов", "Multiple sheets")}
              </option>
              <option value="files">{t("Пакет файлов", "Batch files")}</option>
            </select>
            {source === "sheet" ? (
              <select
                aria-label={t("Лист-источник", "Source sheet")}
                value={ids[0] || ""}
                onChange={(e) => Ids([e.target.value])}
              >
                {tables.map((s) => (
                  <option key={s.id} value={s.id}>
                    {display(s)}
                  </option>
                ))}
              </select>
            ) : source === "sheets" ? (
              <div className="checklist">
                {tables.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(s.id)}
                      onChange={(e) => {
                        Ids(
                          e.target.checked
                            ? [...ids, s.id]
                            : ids.filter((i) => i !== s.id),
                        );
                        Mappings({});
                      }}
                    />
                    {display(s)}
                  </label>
                ))}
              </div>
            ) : (
              <>
                <button
                  className="btn"
                  onClick={() => fileRef.current?.click()}
                >
                  <Files size={15} />
                  {t("Выбрать файлы", "Choose files")}
                </button>
                <small>{files.map((f) => f.name).join(", ")}</small>
              </>
            )}
            {inputs.length > 1 && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={combine}
                  onChange={(e) => Combine(e.target.checked)}
                />
                {t("Объединить перед обработкой", "Append before processing")}
              </label>
            )}
            {merged && (
              <button className="textlink" onClick={() => MapOpen(true)}>
                {t("Сопоставить столбцы", "Map columns")}
              </button>
            )}
            <div className="flownodes">
              {stages.map((s, i) => (
                <div
                  key={i}
                  className={"flownode " + (selected === i ? "chosen" : "")}
                >
                  <button onClick={() => Select(i)}>
                    <span>{i + 1}</span>
                    <b>{t(...stageLabels[s.kind])}</b>
                  </button>
                  <button
                    className="iconbtn"
                    disabled={!i}
                    aria-label={t("Шаг выше", "Move step up")}
                    onClick={() => {
                      const n = stages.slice();
                      [n[i - 1], n[i]] = [n[i], n[i - 1]];
                      Steps(n);
                      Select(i - 1);
                    }}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    className="iconbtn"
                    disabled={i === stages.length - 1}
                    aria-label={t("Шаг ниже", "Move step down")}
                    onClick={() => {
                      const n = stages.slice();
                      [n[i], n[i + 1]] = [n[i + 1], n[i]];
                      Steps(n);
                      Select(i + 1);
                    }}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    className="iconbtn"
                    aria-label={t("Удалить шаг", "Remove step")}
                    onClick={() => {
                      Steps(stages.filter((_, n) => n !== i));
                      Select(Math.max(0, i - 1));
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <select
              aria-label={t("Добавить шаг", "Add step")}
              value=""
              onChange={(e) => add(e.target.value as Stage["kind"])}
            >
              <option value="">{t("+ Добавить шаг", "+ Add step")}</option>
              {Object.entries(stageLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(...v)}
                </option>
              ))}
            </select>
          </section>
          <section className="panel studio-panel">
            <div className="panelhead">
              <h2>{t("Параметры шага", "Step settings")}</h2>
              <SlidersHorizontal size={17} />
            </div>
            {cur ? (
              <>
                <div className="stepheading">
                  <span>{selected + 1}</span>
                  <b>{t(...stageLabels[cur.kind])}</b>
                </div>
                <Settings
                  s={cur}
                  cols={columnsAfter(cols, stages.slice(0, selected))}
                  t={t}
                  change={(v) =>
                    Steps(stages.map((s, i) => (i === selected ? v : s)))
                  }
                />
                <button
                  className="btn"
                  disabled={!inputs.length}
                  onClick={() => run(selected + 1)}
                >
                  <Eye size={15} />
                  {t("До этого шага", "Preview through this step")}
                </button>
              </>
            ) : (
              <div className="emptywell">
                {t("Добавьте первый шаг", "Add the first step")}
              </div>
            )}
          </section>
        </div>
      </fieldset>
      <section className="panel studio-panel topgap">
        <div className="panelhead">
          <h2>{t("Предпросмотр результата", "Result preview")}</h2>
          <div className="buttonrow">
            {running ? (
              <button className="btn" onClick={() => abort.current?.abort()}>
                <Square size={14} />
                {t("Остановить", "Stop")}
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={!inputs.length || !stages.length}
                onClick={() => run()}
              >
                <Play size={15} />
                {t("Выполнить сценарий", "Run workflow")}
              </button>
            )}
            <button
              className="btn"
              disabled={!complete || !out || running}
              onClick={apply}
            >
              <Check size={15} />
              {t("Применить результат", "Apply result")}
            </button>
          </div>
        </div>
        {progress.length > 0 && (
          <progress
            max={progress.at(-1)!.total}
            value={progress.at(-1)!.done}
          />
        )}
        <ErrorBox message={err} />
        {out ? (
          out.map((g, i) => (
            <div key={i}>
              <h3 className="previewtitle">{g.name}</h3>
              <PreviewGrid g={g} t={t} max={5} />
            </div>
          ))
        ) : (
          <p className="muted">
            {running
              ? t("Обработка в фоновом потоке…", "Processing in a worker…")
              : t(
                  "После расчёта вы сможете проверить данные и добавить результат отдельным листом.",
                  "After running, review the data and add the result as a separate sheet.",
                )}
          </p>
        )}
        {progress.length > 0 && (
          <details>
            <summary>
              {t("Промежуточные результаты", "Intermediate results")} (
              {progress.length})
            </summary>
            {progress.map((p, i) => (
              <div key={i}>
                <h4>
                  {p.name} · {p.done}/{p.total} · {p.rows} {t("строк", "rows")}
                </h4>
                <PreviewGrid t={t} g={p.sample} max={4} />
              </div>
            ))}
          </details>
        )}
        {log.length > 0 && (
          <details>
            <summary>{t("Журнал выполнения", "Execution log")}</summary>
            <pre className="code">{log.join("\n")}</pre>
          </details>
        )}
      </section>
      {mapping && (
        <Modal
          title={t("Сопоставить столбцы", "Map columns")}
          close={() => MapOpen(false)}
        >
          <p className="hint">
            {t(
              "Столбцы с одинаковыми итоговыми именами будут объединены.",
              "Columns with identical output names will be aligned.",
            )}
          </p>
          {inputs.map((s, i) => (
            <details key={i} open={i === 0}>
              <summary>{s.name}</summary>
              {s.cols.map((col, j) => (
                <Field label={col} key={col}>
                  <input
                    value={mappings[i]?.[j] ?? col}
                    onChange={(e) => {
                      const list = (mappings[i] ?? s.cols).slice();
                      list[j] = e.target.value;
                      Mappings({ ...mappings, [i]: list });
                    }}
                  />
                </Field>
              ))}
            </details>
          ))}
          <button className="btn primary" onClick={() => MapOpen(false)}>
            {t("Готово", "Done")}
          </button>
        </Modal>
      )}
    </>
  );
}
