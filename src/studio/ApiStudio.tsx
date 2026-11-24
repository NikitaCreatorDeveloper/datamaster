import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Save,
  Database,
  Clock3,
  PlugZap,
  Trash2,
  Globe,
  Code2,
} from "lucide-react";
import { type Grid } from "../core";
import { Modal, ErrorBox, errorText, type T } from "../ui";
import { Field, PreviewGrid } from "./widgets";
import {
  requestData,
  sanitizeRequest,
  loadTemplate,
  emptyRequest,
  methods,
  type RequestSpec,
  type ApiReply,
  type RequestTemplate,
} from "./api";
const storeKey = "dm.api.templates.v2";
function getTemplates() {
  try {
    const data = JSON.parse(localStorage.getItem(storeKey) || "[]");
    return Array.isArray(data)
      ? (data.filter(
          (x) =>
            x &&
            typeof x.id === "string" &&
            typeof x.origin === "string" &&
            typeof x.route === "string" &&
            Array.isArray(x.params) &&
            Array.isArray(x.headers) &&
            methods.includes(x.method),
        ) as RequestTemplate[])
      : [];
  } catch {
    return [];
  }
}
export function ApiStudio({
  t,
  upsert,
  notify,
}: {
  t: T;
  upsert: (g: Grid, name: string, existing: string) => string;
  notify: (s: string) => void;
}) {
  const [spec, S] = useState<RequestSpec>(emptyRequest),
    [tab, Tab] = useState("params"),
    [result, Result] = useState<ApiReply | null>(null),
    [out, Out] = useState("table"),
    [err, E] = useState(""),
    [running, Run] = useState(false),
    [confirm, C] = useState(""),
    [name, N] = useState(""),
    [templates, Templates] = useState<RequestTemplate[]>(getTemplates),
    [interval, Interval] = useState(60),
    [auto, Auto] = useState(false),
    [sheetId, Id] = useState(""),
    [sheetName, SheetName] = useState("API");
  const latest = useRef({ spec, upsert, sheetId, sheetName }),
    ctrl = useRef<AbortController | null>(null),
    live = useRef(true);
  latest.current = { spec, upsert, sheetId, sheetName };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      ctrl.current?.abort();
    };
  }, []);
  function update(p: Partial<RequestSpec>) {
    S((v) => ({ ...v, ...p }));
    Result(null);
    E("");
    Auto(false);
  }
  async function send(periodic = false) {
    if (ctrl.current) return;
    const state = latest.current,
      ac = new AbortController();
    ctrl.current = ac;
    Run(true);
    E("");
    const timeout = setTimeout(() => ac.abort(), 30000);
    try {
      const reply = await requestData(state.spec, ac.signal);
      if (!live.current) return;
      Result(reply);
      if (reply.status >= 400 || reply.dataError) {
        Auto(false);
        E(
          reply.status >= 400
            ? "HTTP " + reply.status
            : errorText(Error(reply.dataError), t),
        );
        Out("json");
      } else if (periodic && reply.grid && state.sheetId) {
        Id(state.upsert(reply.grid, state.sheetName, state.sheetId));
      }
    } catch (e) {
      if (live.current) {
        Result(null);
        E(errorText(e, t));
        Auto(false);
      }
    } finally {
      clearTimeout(timeout);
      ctrl.current = null;
      if (live.current) Run(false);
    }
  }
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(
      () => {
        if (!document.hidden) void send(true);
      },
      Math.max(15, interval) * 1000,
    );
    return () => clearInterval(timer);
  }, [auto, interval]);
  function persist(next: RequestTemplate[]) {
    localStorage.setItem(storeKey, JSON.stringify(next));
    Templates(next);
  }
  const offline = !!document.querySelector(
    'meta[name="datamaster-distribution"][content="offline"]',
  );
  return (
    <>
      <div className="pagetitle">
        <div>
          <h1>API Studio</h1>
          <p>
            {t(
              "Запросы, ответы и обновление таблиц",
              "Requests, responses and live table updates",
            )}
          </p>
        </div>
        <button
          className="btn"
          disabled={offline || running}
          onClick={() => {
            update({
              ...emptyRequest(),
              url: new URL("/samples/shipments.json", location.origin).href,
              path: "data.shipments",
            });
            Tab("params");
          }}
        >
          <Globe size={15} />
          {t("Пример запроса", "Sample request")}
        </button>
      </div>
      <div className="studio-layout">
        <section className="panel studio-panel">
          <div className="panelhead">
            <h2>{t("Запрос", "Request")}</h2>
            <PlugZap size={17} />
          </div>
          <fieldset disabled={running || auto}>
            <div className="httpbar">
              <select
                aria-label={t("Метод", "Method")}
                value={spec.method}
                onChange={(e) =>
                  update({
                    method: e.target.value as RequestSpec["method"],
                    paging: "none",
                  })
                }
              >
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input
                aria-label={t("Адрес запроса", "Request URL")}
                type="url"
                autoComplete="off"
                placeholder="https://api.example.com/v1/orders"
                value={spec.url}
                onChange={(e) => update({ url: e.target.value })}
              />
            </div>
            <div className="tabstrip">
              {[
                ["params", t("Параметры", "Params")],
                ["headers", t("Заголовки", "Headers")],
                ["body", t("Тело", "Body")],
                ["auth", t("Доступ", "Auth")],
                ["pages", t("Страницы", "Pages")],
              ].map(([k, v]) => (
                <button
                  className={k === tab ? "on" : ""}
                  key={k}
                  onClick={() => Tab(k)}
                >
                  {v}
                </button>
              ))}
            </div>
            {tab === "params" || tab === "headers" ? (
              <Field
                label={
                  tab === "params"
                    ? t(
                        "Параметры URL · JSON-объект строк",
                        "URL parameters · JSON string map",
                      )
                    : t(
                        "HTTP-заголовки · JSON-объект строк",
                        "HTTP headers · JSON string map",
                      )
                }
              >
                <textarea
                  className="code"
                  autoComplete="off"
                  value={spec[tab]}
                  onChange={(e) => update({ [tab]: e.target.value })}
                />
              </Field>
            ) : tab === "body" ? (
              <Field label={t("Тело запроса · JSON", "Request body · JSON")}>
                <textarea
                  disabled={spec.method === "GET"}
                  className="code"
                  value={spec.body}
                  onChange={(e) => update({ body: e.target.value })}
                />
                {spec.method === "GET" && (
                  <small>
                    {t(
                      "Тело доступно для POST, PUT, PATCH и DELETE.",
                      "Bodies are available for POST, PUT, PATCH and DELETE.",
                    )}
                  </small>
                )}
              </Field>
            ) : tab === "auth" ? (
              <>
                <Field label={t("Авторизация", "Authorization")}>
                  <select
                    value={spec.auth}
                    onChange={(e) =>
                      update({
                        auth: e.target.value as RequestSpec["auth"],
                        token: "",
                        user: "",
                      })
                    }
                  >
                    {[
                      ["none", t("Без авторизации", "None")],
                      ["bearer", "Bearer"],
                      ["basic", "Basic"],
                      ["key", "API key"],
                    ].map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                {spec.auth === "basic" && (
                  <Field label={t("Пользователь", "User")}>
                    <input
                      autoComplete="off"
                      value={spec.user}
                      onChange={(e) => update({ user: e.target.value })}
                    />
                  </Field>
                )}
                {spec.auth === "key" && (
                  <Field label={t("Имя заголовка", "Header name")}>
                    <input
                      value={spec.keyName}
                      onChange={(e) => update({ keyName: e.target.value })}
                    />
                  </Field>
                )}
                {spec.auth !== "none" && (
                  <Field label={t("Токен или пароль", "Token or password")}>
                    <input
                      type="password"
                      autoComplete="off"
                      value={spec.token}
                      onChange={(e) => update({ token: e.target.value })}
                    />
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label={t("Пагинация GET", "GET pagination")}>
                  <select
                    disabled={spec.method !== "GET"}
                    value={spec.paging}
                    onChange={(e) =>
                      update({
                        paging: e.target.value as RequestSpec["paging"],
                      })
                    }
                  >
                    <option value="none">
                      {t("Один запрос", "Single request")}
                    </option>
                    <option value="page">
                      {t("Номер страницы от 1", "Page number from 1")}
                    </option>
                    <option value="cursor">
                      {t("Курсор из ответа", "Response cursor")}
                    </option>
                  </select>
                </Field>
                {spec.paging !== "none" && (
                  <div className="formgrid">
                    <Field label={t("Параметр страницы", "Page parameter")}>
                      <input
                        value={spec.pageParam}
                        onChange={(e) => update({ pageParam: e.target.value })}
                      />
                    </Field>
                    <Field label={t("Максимум страниц", "Page limit")}>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={spec.maxPages}
                        onChange={(e) =>
                          update({ maxPages: Number(e.target.value) })
                        }
                      />
                    </Field>
                  </div>
                )}
                {spec.paging === "cursor" && (
                  <Field label={t("Путь к курсору", "Cursor path")}>
                    <input
                      value={spec.cursorPath}
                      onChange={(e) => update({ cursorPath: e.target.value })}
                    />
                  </Field>
                )}
              </>
            )}
            <Field label={t("Путь к записям JSON", "JSON record path")}>
              <input
                placeholder="data.items"
                value={spec.path}
                onChange={(e) => update({ path: e.target.value })}
              />
            </Field>
          </fieldset>
          <div className="buttonrow">
            <button
              className="btn primary"
              disabled={running || !spec.url || auto}
              onClick={() => (spec.method === "GET" ? send() : C("mutation"))}
            >
              <Play size={15} />
              {t("Отправить", "Send")}
            </button>
            {running && (
              <button className="btn" onClick={() => ctrl.current?.abort()}>
                <Square size={14} />
                {t("Прервать", "Cancel")}
              </button>
            )}
            <button
              className="btn"
              disabled={!spec.url || running}
              onClick={() => C("save")}
            >
              <Save size={15} />
              {t("Сохранить шаблон", "Save template")}
            </button>
          </div>
          <ErrorBox message={err} />
        </section>
        <aside className="panel studio-panel">
          <div className="panelhead">
            <h2>{t("Шаблоны запросов", "Request templates")}</h2>
            <span className="count">{templates.length}</span>
          </div>
          {templates.length ? (
            templates.map((v) => (
              <div className="templaterow" key={v.id}>
                <button
                  disabled={running}
                  onClick={() => {
                    update(loadTemplate(v));
                    Id("");
                  }}
                >
                  <b>{v.method}</b>
                  {v.name}
                </button>
                <button
                  className="iconbtn"
                  aria-label={t("Удалить шаблон", "Delete template")}
                  onClick={() => {
                    try {
                      persist(templates.filter((x) => x.id !== v.id));
                    } catch {
                      E(errorText(Error("storage"), t));
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          ) : (
            <p className="muted">
              {t(
                "Сохраните структуру запроса, чтобы повторить его с новыми параметрами.",
                "Save a request structure to reuse it with new parameters.",
              )}
            </p>
          )}
          <div className="separule" />
          <h3>{t("Обновление листа", "Sheet refresh")}</h3>
          <Field label={t("Название листа API", "API sheet name")}>
            <input
              value={sheetName}
              onChange={(e) => SheetName(e.target.value)}
            />
          </Field>
          <Field label={t("Интервал, сек.", "Interval, sec.")}>
            <input
              type="number"
              min={15}
              max={86400}
              value={interval}
              onChange={(e) =>
                Interval(Math.min(86400, Math.max(15, Number(e.target.value))))
              }
            />
          </Field>
          <button
            className="btn"
            disabled={
              !auto && (!sheetId || spec.method !== "GET" || !result?.grid)
            }
            onClick={() => Auto(!auto)}
          >
            <Clock3 size={15} />
            {auto
              ? t("Остановить обновление", "Stop refresh")
              : t("Автообновление", "Start refresh")}
          </button>
          <p className="hint">
            {t(
              "Сначала перенесите ответ в лист. Таймер активен на открытом экране API Studio.",
              "Import a response first. The timer runs while API Studio is visible.",
            )}
          </p>
        </aside>
      </div>
      <section className="panel studio-panel topgap">
        <div className="panelhead">
          <h2>{t("Ответ API", "API response")}</h2>
          {result && (
            <small className="httpstatus">
              HTTP {result.status} · {result.ms} ms ·{" "}
              {result.bytes.toLocaleString()} B · {result.pages}{" "}
              {t("стр.", "pages")}
            </small>
          )}
        </div>
        {result ? (
          <>
            <div className="tabstrip">
              <button
                className={out === "table" ? "on" : ""}
                onClick={() => Out("table")}
              >
                {t("Таблица", "Table")}
              </button>
              <button
                className={out === "json" ? "on" : ""}
                onClick={() => Out("json")}
              >
                JSON
              </button>
            </div>
            {out === "json" ? (
              <pre className="code jsonpreview">
                {JSON.stringify(result.json, null, 2)?.slice(0, 40000)}
              </pre>
            ) : result.grid ? (
              <PreviewGrid g={result.grid} t={t} />
            ) : (
              <p className="muted">
                {t("Записей для импорта нет.", "No records to import.")}
              </p>
            )}
            {result.truncated && (
              <p className="hint">
                {t(
                  "Достигнут выбранный предел пагинации.",
                  "The selected page limit was reached.",
                )}
              </p>
            )}
            <button
              className="btn primary"
              disabled={!result.grid || running}
              onClick={() => {
                if (result.grid) {
                  try {
                    Id(upsert(result.grid, sheetName || "API", sheetId));
                  } catch (e) {
                    E(errorText(e, t));
                    return;
                  }
                  notify(
                    t("Данные перенесены в лист", "Data imported into sheet"),
                  );
                }
              }}
            >
              <Database size={15} />
              {sheetId
                ? t("Обновить лист", "Update sheet")
                : t("В таблицу", "Import to sheet")}
            </button>
          </>
        ) : (
          <div className="emptywell">
            <Code2 size={25} />
            <span>
              {t(
                "Отправьте запрос для просмотра ответа.",
                "Send a request to inspect its response.",
              )}
            </span>
          </div>
        )}
      </section>
      {confirm && (
        <Modal
          title={
            confirm === "save"
              ? t("Сохранить шаблон", "Save template")
              : t("Подтвердите запрос", "Confirm request")
          }
          close={() => C("")}
        >
          {confirm === "save" ? (
            <>
              <Field label={t("Название шаблона", "Template name")}>
                <input
                  value={name}
                  maxLength={80}
                  onChange={(e) => N(e.target.value)}
                />
              </Field>
              <p className="hint">
                {t(
                  "Сохранятся метод, домен, тип авторизации, общие части пути и имена полей. Значения параметров, тело и секреты вводятся заново.",
                  "Saves method, origin, auth type, common route segments and field names. Supply parameter values, body and secrets again.",
                )}
              </p>
              <button
                className="btn primary"
                disabled={!name.trim()}
                onClick={() => {
                  try {
                    persist([...templates, sanitizeRequest(spec, name.trim())]);
                    C("");
                    N("");
                  } catch (e) {
                    E(errorText(e, t));
                    C("");
                  }
                }}
              >
                {t("Сохранить", "Save")}
              </button>
            </>
          ) : (
            <>
              <p className="dialogdesc">
                {t(
                  "Этот запрос может изменить данные у получателя.",
                  "This request may change data on the destination server.",
                )}
              </p>
              <code className="endpoint">
                {spec.method} {spec.url.split("?")[0]}
              </code>
              <div className="modalfoot">
                <button className="btn" onClick={() => C("")}>
                  {t("Отмена", "Cancel")}
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    C("");
                    void send();
                  }}
                >
                  {t("Подтвердить отправку", "Confirm send")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
