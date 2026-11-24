import { type Table, type Cell, type Step } from "./core";
const products = [
  "Кофе в зёрнах",
  "Зелёный чай",
  "Чёрный чай",
  "Керамическая кружка",
  "Стеклянный чайник",
  "Кофемолка",
  "Термокружка",
  "Френч-пресс",
  "Дрип-кофе",
  "Кофейная пара",
  "Фильтры бумажные",
  "Кофе молотый",
];
const sku = (i: number) => "DM-" + String(10001 + i);
const price = (i: number) => Math.round((210 + ((i * 137) % 4700)) / 10) * 10;
const names = [
  "Анна",
  "Михаил",
  "Елена",
  "Иван",
  "Мария",
  "Денис",
  "Дарья",
  "Олег",
];
const surnames = [
  "Иванова",
  "Орлов",
  "Петрова",
  "Соколов",
  "Попова",
  "Смирнов",
  "Лебедева",
  "Васильев",
];
export const demoNames: Record<string, [string, string]> = {
  catalog: ["Каталог товаров", "Product catalog"],
  sales: ["Отчёт по продажам", "Sales report"],
  clients: ["Клиентская база", "Customer directory"],
  supplier: ["Прайс поставщика", "Supplier price list"],
};
export function demo(id: string): Table {
  const base = {
    id,
    name: demoNames[id][0],
    demo: true,
    updated: 0,
    steps: [],
  };
  const gen = (n: number, fn: (i: number) => Cell[]) =>
    Array.from({ length: n }, (_, i) => fn(i));
  if (id === "catalog" || id === "supplier")
    return {
      ...base,
      format: id === "catalog" ? "XLSX" : "CSV",
      cols: ["Артикул", "Наименование", "Категория", "Цена", "Остаток"],
      rows: gen(id === "catalog" ? 248 : 196, (i) => [
        sku(i),
        products[i % 12] + " " + (1 + Math.floor(i / 12)),
        i % 3 === 0 ? "Напитки" : "Аксессуары",
        price(i) + (id === "supplier" && i % 5 === 0 ? 40 : 0),
        (7 * i) % 185,
      ]),
    };
  if (id === "sales")
    return {
      ...base,
      format: "CSV",
      cols: ["Заказ", "Дата", "Артикул", "Количество", "Сумма", "Статус"],
      rows: gen(864, (i) => [
        "S-" + (5001 + i),
        "2026-10-" + String((i % 31) + 1).padStart(2, "0"),
        sku(i % 248),
        (i % 5) + 1,
        price(i % 248) * ((i % 5) + 1),
        i % 6 === 0 ? "Возврат" : "Оплачен",
      ]),
    };
  return {
    ...base,
    format: "JSON",
    cols: ["ID", "Имя", "Email", "Город"],
    rows: gen(156, (i) => {
      const n = i % 140;
      return [
        n + 1,
        names[n % 8] + " " + surnames[n % 8],
        "client" + (100 + n) + "@example.com",
        ["Москва", "Казань", "Пермь", "Омск"][n % 4],
      ];
    }),
  };
}
export const seeds = () => Object.keys(demoNames).map(demo);
export const templates: {
  id: string;
  source: string;
  title: [string, string];
  description: [string, string];
  steps: Step[];
}[] = [
  {
    id: "prices",
    source: "catalog",
    title: ["Обновление прайса", "Price list update"],
    description: [
      "Пересчёт цен с наценкой и сортировка каталога.",
      "Apply a markup and sort the catalog by its new price.",
    ],
    steps: [
      { kind: "price", col: "Цена", target: "Розничная цена", percent: 15 },
      { kind: "sort", col: "Розничная цена", desc: true },
    ],
  },
  {
    id: "clean",
    source: "clients",
    title: ["Очистка клиентской базы", "Customer data cleanup"],
    description: [
      "Удаление повторов и проверка заполненных email.",
      "Remove duplicate contacts and keep populated emails.",
    ],
    steps: [
      { kind: "dedupe", col: "Email" },
      { kind: "filter", col: "Email", op: "filled", value: "" },
    ],
  },
  {
    id: "sales",
    source: "sales",
    title: ["Подготовка отчёта", "Sales report preparation"],
    description: [
      "Отбор оплаченных заказов и сортировка по сумме.",
      "Keep paid orders and sort them by order value.",
    ],
    steps: [
      { kind: "filter", col: "Статус", op: "equal", value: "Оплачен" },
      { kind: "sort", col: "Сумма", desc: true },
    ],
  },
];
