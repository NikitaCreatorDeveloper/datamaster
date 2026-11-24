import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  FileSpreadsheet,
  Braces,
  FileText,
  Globe,
  Layers3,
} from "lucide-react";
import { type Format, type Step } from "./core";
export type T = (ru: string, en: string) => string;
export const stepLabels: Record<Step["kind"], [string, string]> = {
  markup: ["Расчёт наценки", "Calculate markup"],
  price: ["Пересчёт цен", "Price calculation"],
  dedupe: ["Удаление дублей", "Remove duplicates"],
  filter: ["Фильтрация", "Filter rows"],
  sort: ["Сортировка", "Sort rows"],
  replace: ["Поиск и замена", "Find and replace"],
} as const;
export function stepDescription(s: Step, t: T) {
  const base = t(...stepLabels[s.kind]);
  switch (s.kind) {
    case "markup":
      return base + " · " + s.col + " / " + s.sale + " → " + s.target;
    case "price":
      return (
        base +
        " · " +
        s.col +
        " × " +
        (1 + s.percent / 100).toFixed(2) +
        " → " +
        s.target
      );
    case "dedupe":
      return base + " · " + (s.col || t("вся строка", "whole row"));
    case "sort":
      return base + " · " + s.col + " " + (s.desc ? "↓" : "↑");
    case "filter":
      return (
        base +
        " · " +
        s.col +
        " " +
        {
          contains: t("содержит", "contains"),
          equal: "=",
          gt: ">",
          lt: "<",
          filled: t("заполнен", "is filled"),
        }[s.op] +
        " " +
        s.value
      );
    case "replace":
      return base + " · " + s.col + " · " + s.find + " → " + s.value;
  }
}
export function FormatIcon({ format }: { format: Format }) {
  const Ic = { XLSX: FileSpreadsheet, CSV: FileText, JSON: Braces, API: Globe }[
    format
  ];
  return (
    <span className={"format-icon f-" + format}>
      <Ic size={20} />
    </span>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <span className="brandmark">
        <Layers3 size={24} strokeWidth={2.4} />
      </span>
      DataMaster
    </span>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      prev?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = ref.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="iconbtn"
          onClick={close}
          aria-label="Закрыть / Close"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="errorbox" role="alert">
      {message}
    </div>
  ) : null;
}
export function errorText(e: unknown, t: T) {
  const msg = e instanceof Error ? e.message : "";
  const dict: Record<string, [string, string]> = {
    date: [
      "Введите дату в формате ГГГГ-ММ-ДД.",
      "Enter a valid date in YYYY-MM-DD format.",
    ],
    phone: ["Проверьте телефонные номера.", "Check the phone numbers."],
    styleLimit: [
      "За один раз можно изменить до 100 000 ячеек.",
      "Select up to 100,000 cells per edit.",
    ],
    lastColumn: [
      "Оставьте хотя бы один столбец.",
      "A sheet requires at least one column.",
    ],
    pivotLimit: [
      "Слишком много значений разбивки. Выберите другой столбец.",
      "Too many series. Select a different split column.",
    ],
    outputNames: [
      "Введите непустые уникальные названия выходных столбцов.",
      "Use distinct nonempty output column names.",
    ],
    timeout: [
      "Операция превысила лимит времени. Уменьшите набор данных.",
      "The operation timed out. Reduce the dataset.",
    ],
    worker: [
      "Не удалось запустить фоновое вычисление в браузере.",
      "The browser could not run the background calculation.",
    ],
    projectFormat: [
      "Структура проекта или сценария повреждена либо не поддерживается.",
      "The project or workflow file is invalid or unsupported.",
    ],
    pdfLimit: [
      "Для PDF выберите до 60 000 ячеек и 40 столбцов.",
      "PDF supports up to 60,000 cells and 40 columns.",
    ],
    jsonFields: [
      "Проверьте JSON. Параметры и заголовки задаются объектом строк.",
      "Check the JSON. Parameters and headers must be a string map.",
    ],
    auth: [
      "Введите данные для выбранного типа авторизации.",
      "Enter credentials for the selected authorization type.",
    ],
    paging: [
      "Источник вернул повторный курсор пагинации.",
      "The endpoint returned a repeated cursor.",
    ],
    exportLast: [
      "Разместите единственный шаг экспорта в конце.",
      "Place a single export step at the end.",
    ],
    empty: [
      "Нет заголовков или листов с данными.",
      "There are no headers or populated worksheets.",
    ],
    projectLimit: [
      "В проекте помещается до 150 листов и 3 млн ячеек. Создайте ещё один проект.",
      "A project holds up to 150 sheets and 3 million cells. Create another project.",
    ],
    cellLength: [
      "Ячейка превышает предел Excel в 32 767 символов.",
      "A cell exceeds the Excel limit of 32,767 characters.",
    ],
    limits: [
      "Лимит таблицы — 100 000 строк, 300 столбцов и 1,5 млн ячеек.",
      "Limit: 100,000 rows, 300 columns and 1.5 million cells per table.",
    ],
    json: [
      "Ожидается непустой JSON-массив объектов. Проверьте структуру или путь.",
      "Expected a nonempty JSON array of objects. Check the structure or path.",
    ],
    column: [
      "Столбцы таблицы не соответствуют шагам сценария.",
      "The table is missing a column required by this scenario.",
    ],
    number: [
      "Введите корректное число и название столбца.",
      "Enter a valid number and column name.",
    ],
    numericColumn: [
      "Выберите столбец, содержащий числа.",
      "Select a column containing numeric values.",
    ],
    find: ["Введите текст для поиска.", "Enter text to find."],
    uniqueKey: [
      "Ключ должен быть заполнен и уникален. Проверьте дубли и пустые значения.",
      "The lookup key must be unique and populated. Check empty and duplicate values.",
    ],
    url: [
      "Введите полный HTTPS-адрес без встроенных учётных данных.",
      "Enter a full HTTPS URL without embedded credentials.",
    ],
    cors: [
      "Запрос не выполнен. Проверьте адрес, сеть и разрешение CORS на источнике.",
      "Request failed. Check the URL, connection and CORS policy on the source.",
    ],
    abort: [
      "Запрос прерван или истекло время ожидания.",
      "The request was cancelled or timed out.",
    ],
    size: [
      "Максимальный размер файла или ответа — 16 МБ.",
      "Maximum file or response size is 16 MB.",
    ],
    format: [
      "Поддерживаются .xlsx, .csv и .json.",
      "Supported files: .xlsx, .csv and .json.",
    ],
    csv: [
      "Проверьте кавычки и разделители CSV.",
      "Check the CSV quotes and delimiters.",
    ],
    storage: [
      "Браузер не разрешил сохранить сценарий. Проверьте доступное место и настройки.",
      "The browser could not save this scenario. Check storage space and permissions.",
    ],
  };
  if (msg.includes(" / ")) {
    const parts = msg.split(" / ");
    const key = parts.pop()!;
    return parts.join(" / ") + " · " + (dict[key] ? t(...dict[key]) : key);
  }
  if (dict[msg]) return t(...dict[msg]);
  if (/^HTTP \d+$/.test(msg))
    return t("Источник вернул ошибку ", "Source returned ") + msg;
  return t(
    "Не удалось прочитать данные. Проверьте формат и содержимое.",
    "Could not read the data. Check its format and contents.",
  );
}
