import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  FileUp,
  Globe,
  ShieldCheck,
  Play,
  Check,
  Download,
  Workflow,
  Plus,
  LoaderCircle,
} from "lucide-react";
import {
  appendTables,
  applyStep,
  compareTables,
  joinTables,
  runRecipe,
  type Format,
  type Grid,
  type Recipe,
  type Step,
  type Table,
} from "./core";
import { demo, templates } from "./demo";
import { parseFile, fetchGrid, downloadGrid } from "./io";
import {
  Modal,
  ErrorBox,
  errorText,
  FormatIcon,
  stepLabels,
  stepDescription,
  type T,
} from "./ui";
type Common = { t: T; close: () => void };
export type NewTable = Grid & { name: string; format: Format };
type TableProps = {
  tables: Table[];
  initial: string;
  display: (a: Table) => string;
};
function TableSelect({
  tables,
  id,
  onChange,
  display,
  label,
}: {
  id: string;
  onChange: (id: string) => void;
  display: TableProps["display"];
  tables: Table[];
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={id} onChange={(e) => onChange(e.target.value)}>
        {tables.map((a) => (
          <option key={a.id} value={a.id}>
            {display(a)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ImportDialog({
  t,
  close,
  save,
  api = false,
}: { save: (ts: NewTable[]) => void; api?: boolean } & Common) {
  const [mode, setMode] = useState(api ? "api" : "file"),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [over, setOver] = useState(false);
  const [url, setUrl] = useState(""),
    [token, setToken] = useState(""),
    [path, setPath] = useState(""),
    [name, setName] = useState("");
  const ref = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);
  async function files(fs: FileList | null) {
    if (!fs?.length || busy) return;
    setBusy(true);
    setErr("");
    try {
      const result: NewTable[] = [];
      for (const f of Array.from(fs)) result.push(...(await parseFile(f)));
      if (alive.current) save(result);
    } catch (e) {
      if (alive.current) setErr(errorText(e, t));
    } finally {
      if (alive.current) setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  async function apiLoad() {
    setErr("");
    setBusy(true);
    abort.current = new AbortController();
    const timer = setTimeout(() => abort.current?.abort(), 30000);
    try {
      const g = await fetchGrid(url, path, token, abort.current.signal);
      if (alive.current)
        save([
          { ...g, name: name.trim() || new URL(url).hostname, format: "API" },
        ]);
    } catch (e) {
      if (alive.current) setErr(errorText(e, t));
    } finally {
      clearTimeout(timer);
      if (alive.current) {
        setBusy(false);
        setToken("");
      }
    }
  }
  return (
    <Modal title={t("Импорт данных", "Import data")} close={close}>
      <div className="tabs minor">
        {[
          ["file", t("Из файла", "From file"), FileUp],
          ["api", "REST API", Globe],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Globe;
          return (
            <button
              key={String(id)}
              disabled={busy}
              className={mode === id ? "on" : ""}
              onClick={() => {
                setMode(String(id));
                setErr("");
                setToken("");
              }}
            >
              <I size={15} />
              {String(label)}
            </button>
          );
        })}
      </div>
      {mode === "file" ? (
        <>
          <input
            ref={ref}
            data-testid="file-input"
            type="file"
            accept=".xlsx,.csv,.json"
            multiple
            hidden
            onChange={(e) => files(e.target.files)}
          />
          <button
            disabled={busy}
            className={"dropzone " + (over ? "over" : "")}
            onClick={() => ref.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              files(e.dataTransfer.files);
            }}
          >
            <span className="uploadglyph">
              <UploadCloud size={30} />
            </span>
            <b>
              {busy
                ? t("Читаем данные…", "Reading data…")
                : t(
                    "Выберите или перетащите файлы",
                    "Choose or drop your files",
                  )}
            </b>
            <small>
              XLSX, CSV, JSON · {t("до 16 МБ на файл", "up to 16 MB per file")}
            </small>
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apiLoad();
          }}
        >
          <label>
            {t("Адрес источника", "Source URL")}
            <input
              placeholder="https://api.example.com/products"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className="formgrid">
            <label>
              {t("Название таблицы", "Table name")}
              <input
                value={name}
                placeholder={t("Имя источника", "Source name")}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              {t("Путь к массиву", "Array path")}
              <input
                placeholder="data.items"
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
            </label>
          </div>
          <label>
            {t("Bearer-токен (необязательно)", "Bearer token (optional)")}
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <p className="hint">
            {t(
              "GET-запрос отправляется прямо на указанный HTTPS-адрес. Источник должен разрешать CORS. Токен действует только для этого запроса.",
              "GET requests go directly to the specified HTTPS endpoint. The source must allow CORS. The token is used for this request only.",
            )}
          </p>
          <button disabled={busy} className="btn primary">
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}{" "}
            {t("Загрузить данные", "Fetch data")}
          </button>
        </form>
      )}
      <ErrorBox message={err} />
      <div className="privacyline">
        <ShieldCheck size={16} />
        {t(
          "Файлы обрабатываются в памяти браузера.",
          "Your files are processed in browser memory.",
        )}
      </div>
    </Modal>
  );
}
export function OpDialog({
  t,
  close,
  tables,
  initial,
  display,
  kind,
  save,
}: Common &
  TableProps & {
    kind: Step["kind"];
    save: (a: Table, s: Step, g: Grid) => void;
  }) {
  const [id, idSet] = useState(initial),
    a = tables.find((x) => x.id === id)!,
    [k, K] = useState(kind);
  const defaultCol = (a: Table, k: Step["kind"]) =>
    k === "price"
      ? (a.cols.find((c) => /цен|price|cost/i.test(c)) ?? a.cols[0])
      : k === "dedupe"
        ? ""
        : a.cols[0];
  const [col, C] = useState(defaultCol(a, kind)),
    [target, Tar] = useState(defaultCol(a, kind)),
    [value, V] = useState(""),
    [find, F] = useState(""),
    [percent, P] = useState("15"),
    [desc, D] = useState(false),
    [op, O] = useState<"contains" | "equal" | "gt" | "lt" | "filled">(
      "contains",
    ),
    [err, E] = useState(""),
    [sale, Sale] = useState(a.cols[0]);
  function reset(b: Table, type: Step["kind"]) {
    const c = defaultCol(b, type);
    C(c);
    Tar(type === "markup" ? t("Наценка, %", "Markup, %") : c);
    Sale(b.cols.find((x) => x !== c) ?? c);
    E("");
  }
  function run() {
    try {
      let s: Step;
      switch (k) {
        case "markup":
          s = { kind: k, col, sale, target };
          break;
        case "price":
          if (!percent.trim()) throw Error("number");
          s = {
            kind: k,
            col,
            target,
            percent: Number(percent.replace(",", ".")),
          };
          break;
        case "sort":
          s = { kind: k, col, desc };
          break;
        case "dedupe":
          s = { kind: k, col };
          break;
        case "filter":
          s = { kind: k, col, op, value };
          break;
        case "replace":
          s = { kind: k, col, find, value };
          break;
      }
      save(a, s, applyStep(a, s));
    } catch (e) {
      E(errorText(e, t));
    }
  }
  return (
    <Modal title={t("Операция с таблицей", "Table operation")} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <TableSelect
          tables={tables}
          id={id}
          display={display}
          label={t("Таблица", "Table")}
          onChange={(v) => {
            idSet(v);
            reset(tables.find((x) => x.id === v)!, k);
          }}
        />
        <label>
          {t("Операция", "Operation")}
          <select
            value={k}
            onChange={(e) => {
              const type = e.target.value as typeof k;
              K(type);
              reset(a, type);
            }}
          >
            {Object.entries(stepLabels).map(([key, v]) => (
              <option key={key} value={key}>
                {t(...v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {k === "markup"
            ? t("Себестоимость", "Cost column")
            : t("Столбец", "Column")}
          <select
            value={col}
            onChange={(e) => {
              C(e.target.value);
              if (k !== "markup") Tar(e.target.value);
            }}
          >
            {k === "dedupe" && (
              <option value="">{t("Все столбцы", "All columns")}</option>
            )}
            {a.cols.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {k === "price" && (
          <div className="formgrid">
            <label>
              {t("Наценка, %", "Markup, %")}
              <input
                required
                value={percent}
                onChange={(e) => P(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label>
              {t("Столбец результата", "Output column")}
              <input
                required
                value={target}
                onChange={(e) => Tar(e.target.value)}
              />
            </label>
          </div>
        )}
        {k === "markup" && (
          <>
            <label>
              {t("Цена продажи", "Sales price")}
              <select value={sale} onChange={(e) => Sale(e.target.value)}>
                {a.cols.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              {t("Столбец результата", "Output column")}
              <input
                required
                value={target}
                onChange={(e) => Tar(e.target.value)}
              />
            </label>
            <p className="hint">
              {t(
                "Наценка = (цена продажи − себестоимость) / себестоимость × 100. При нулевой себестоимости результат пуст.",
                "Markup = (sale price − cost) / cost × 100. A zero cost produces a blank result.",
              )}
            </p>
          </>
        )}
        {k === "sort" && (
          <label>
            {t("Порядок", "Order")}
            <select
              value={String(desc)}
              onChange={(e) => D(e.target.value === "true")}
            >
              <option value="false">{t("По возрастанию", "Ascending")}</option>
              <option value="true">{t("По убыванию", "Descending")}</option>
            </select>
          </label>
        )}
        {k === "filter" && (
          <label>
            {t("Условие", "Condition")}
            <select value={op} onChange={(e) => O(e.target.value as typeof op)}>
              {Object.entries({
                contains: t("Содержит", "Contains"),
                equal: t("Равно", "Equals"),
                gt: t("Больше", "Greater than"),
                lt: t("Меньше", "Less than"),
                filled: t("Заполнен", "Is populated"),
              }).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        {k === "replace" && (
          <label>
            {t("Найти текст", "Find text")}
            <input required value={find} onChange={(e) => F(e.target.value)} />
          </label>
        )}
        {(k === "replace" || (k === "filter" && op !== "filled")) && (
          <label>
            {k === "replace"
              ? t("Заменить на", "Replace with")
              : t("Значение", "Value")}
            <input value={value} onChange={(e) => V(e.target.value)} />
          </label>
        )}
        <ErrorBox message={err} />
        <div className="modalfoot">
          <button type="button" className="btn" onClick={close}>
            {t("Отмена", "Cancel")}
          </button>
          <button className="btn primary">
            <Check size={16} />
            {t("Применить", "Apply")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CombineDialog({
  t,
  close,
  tables,
  initial,
  display,
  compare,
  save,
}: Common & TableProps & { compare: boolean; save: (ts: NewTable[]) => void }) {
  const [left, L] = useState(initial),
    [right, R] = useState(
      (
        tables.find(
          (x) => x.id === (initial === "catalog" ? "supplier" : ""),
        ) ?? tables.find((x) => x.id !== initial)
      )?.id ?? initial,
    );
  const a = tables.find((x) => x.id === left)!,
    b = tables.find((x) => x.id === right)!;
  const [mode, M] = useState(compare ? "compare" : "append"),
    [ka, A] = useState(a.cols[0]),
    [kb, B] = useState(b.cols[0]),
    [err, E] = useState("");
  const run = () => {
    try {
      const result =
        mode === "append"
          ? appendTables(a, b)
          : mode === "join"
            ? joinTables(a, b, ka, kb)
            : compareTables(a, b, ka, kb, t("ru", "en") === "en");
      save([
        {
          ...result,
          name:
            (mode === "compare"
              ? t("Сравнение", "Comparison")
              : t("Объединение", "Merge")) +
            " · " +
            display(a) +
            " + " +
            display(b),
          format: "XLSX",
        },
      ]);
    } catch (e) {
      E(errorText(e, t));
    }
  };
  return (
    <Modal
      title={t("Объединение и сравнение", "Merge and compare")}
      close={close}
    >
      <label>
        {t("Режим", "Mode")}
        <select value={mode} onChange={(e) => M(e.target.value)}>
          <option value="append">{t("Добавить строки", "Append rows")}</option>
          <option value="join">
            {t("Соединить по ключу", "Left join on key")}
          </option>
          <option value="compare">
            {t("Сравнить по ключу", "Compare by key")}
          </option>
        </select>
      </label>
      <TableSelect
        tables={tables}
        id={left}
        display={display}
        label={t("Основная таблица", "Primary table")}
        onChange={(v) => {
          L(v);
          A(tables.find((x) => x.id === v)!.cols[0]);
          if (v === right) {
            R(left);
            B(a.cols[0]);
          }
        }}
      />
      <TableSelect
        tables={tables.filter((x) => x.id !== left)}
        id={right}
        display={display}
        label={t("Вторая таблица", "Second table")}
        onChange={(v) => {
          R(v);
          B(tables.find((x) => x.id === v)!.cols[0]);
        }}
      />
      {mode !== "append" && (
        <div className="formgrid">
          {[
            [ka, A, a, t("Первый ключ", "Primary key")],
            [kb, B, b, t("Второй ключ", "Second key")],
          ].map(([v, fn, tab, label]) => (
            <label key={String(label)}>
              {String(label)}
              <select
                value={v as string}
                onChange={(e) => (fn as typeof A)(e.target.value)}
              >
                {(tab as Table).cols.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <p className="hint">
        {t(
          "Результат откроется в новой таблице.",
          "The result will open in a new table.",
        )}
      </p>
      <ErrorBox message={err} />
      <div className="modalfoot">
        <button className="btn primary" onClick={run}>
          <Plus size={16} />
          {t("Создать таблицу", "Create table")}
        </button>
      </div>
    </Modal>
  );
}
export function RecipeDialog({
  t,
  close,
  item,
  display,
  tables,
  initial,
  save,
}: Common &
  TableProps & {
    item: (typeof templates)[number] | Recipe;
    save: (
      a: Table,
      g: Grid,
      name: string,
      isNew: boolean,
      steps: Step[],
    ) => void;
  }) {
  const built = "source" in item,
    [id, S] = useState(built ? "_demo" : initial),
    [err, E] = useState("");
  const title = built ? t(...item.title) : item.name;
  function run() {
    try {
      const fresh = built && id === "_demo",
        a = fresh ? demo(item.source) : tables.find((x) => x.id === id);
      if (!a) throw Error("empty");
      save(a, runRecipe(a, item.steps), title, fresh, item.steps);
    } catch (e) {
      E(errorText(e, t));
    }
  }
  return (
    <Modal title={title} close={close}>
      {built && <p className="dialogdesc">{t(...item.description)}</p>}
      <div className="steplist">
        {item.steps.map((s, i) => (
          <div key={i}>
            <span>{i + 1}</span>
            {stepDescription(s, t)}
          </div>
        ))}
      </div>
      <label>
        {t("Источник данных", "Data source")}
        <select value={id} onChange={(e) => S(e.target.value)}>
          {built && (
            <option value="_demo">
              {t("Новая копия демоданных", "Fresh copy of demo data")}
            </option>
          )}
          {tables.map((a) => (
            <option key={a.id} value={a.id}>
              {display(a)}
            </option>
          ))}
        </select>
      </label>
      <ErrorBox message={err} />
      <div className="modalfoot">
        <button className="btn primary" onClick={run}>
          <Play size={15} />
          {t("Запустить сценарий", "Run scenario")}
        </button>
      </div>
    </Modal>
  );
}
export function ExportDialog({
  t,
  close,
  a,
  name,
  done,
}: Common & { a: Table; name: string; done: () => void }) {
  const [fmt, F] = useState<"XLSX" | "CSV" | "JSON">(
      a.format === "API" ? "JSON" : a.format,
    ),
    [busy, B] = useState(false),
    [err, E] = useState("");
  return (
    <Modal title={t("Экспорт таблицы", "Export table")} close={close}>
      <p className="dialogdesc">
        {name} · {a.rows.length} {t("строк", "rows")}
      </p>
      <div className="format-options">
        {(["XLSX", "CSV", "JSON"] as const).map((f) => (
          <button
            key={f}
            className={f === fmt ? "selected" : ""}
            onClick={() => F(f)}
          >
            <FormatIcon format={f} />
            {f}
          </button>
        ))}
      </div>
      <ErrorBox message={err} />
      <div className="modalfoot">
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            B(true);
            try {
              await downloadGrid(a, name, fmt);
              done();
            } catch (e) {
              E(errorText(e, t));
            } finally {
              B(false);
            }
          }}
        >
          <Download size={16} />
          {t("Скачать файл", "Download file")}
        </button>
      </div>
    </Modal>
  );
}
export function NameDialog({
  t,
  close,
  title,
  initial = "",
  save,
  scenario = false,
}: Common & {
  title: string;
  initial?: string;
  scenario?: boolean;
  save: (v: string) => void;
}) {
  const [v, V] = useState(initial),
    [err, E] = useState("");
  return (
    <Modal title={title} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim())
            try {
              save(v.trim());
            } catch (e) {
              E(errorText(e, t));
            }
        }}
      >
        <label>
          {t("Название", "Name")}
          <input
            autoFocus
            required
            maxLength={100}
            value={v}
            onChange={(e) => V(e.target.value)}
          />
        </label>
        {scenario && (
          <p className="hint">
            {t(
              "Шаги, имена столбцов и введённые параметры сохранятся в этом браузере.",
              "The steps, column names and entered parameters will be saved in this browser.",
            )}
          </p>
        )}
        <ErrorBox message={err} />
        <div className="modalfoot">
          <button className="btn primary">
            <Workflow size={16} />
            {t("Сохранить", "Save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
