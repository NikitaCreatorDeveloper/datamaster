import {
  appendTables,
  applyStep,
  fromJSON,
  joinTables,
  runRecipe,
  type Cell,
  type Format,
  type Grid,
  type Step,
  type Table,
} from "./core";
import { encode, parseFile } from "./io";
import offlineShipments from "../public/samples/shipments.json";

type Text = [string, string];
type Translate = (ru: string, en: string) => string;
type SampleId =
  | "shop"
  | "stock"
  | "crm"
  | "sales"
  | "finance"
  | "suppliers"
  | "api"
  | "batch";
type Sample = { id: SampleId; title: Text; description: Text };
export type SampleResult = {
  tables: Table[];
  primary: string;
  view: "editor" | "analytics" | "api" | "automation";
};

export const businessSamples: Sample[] = [
  {
    id: "shop",
    title: ["Прайс интернет-магазина", "Store price list"],
    description: [
      "Рассчитать розничные цены для коллекции товаров для дома.",
      "Set retail prices for a homeware collection.",
    ],
  },
  {
    id: "stock",
    title: ["Пополнение склада", "Stock replenishment"],
    description: [
      "Составить заказ на пополнение с учётом резервов.",
      "Prepare a purchase order using available stock.",
    ],
  },
  {
    id: "crm",
    title: ["База клиентов CRM", "CRM contacts"],
    description: [
      "Очистить адреса и объединить повторные контакты.",
      "Clean email addresses and remove repeat contacts.",
    ],
  },
  {
    id: "sales",
    title: ["Аналитика продаж", "Sales analytics"],
    description: [
      "Сопоставить выручку каналов за шесть месяцев.",
      "Compare channel revenue over six months.",
    ],
  },
  {
    id: "finance",
    title: ["Доходы и расходы", "Income and expenses"],
    description: [
      "Свести журнал операций и посчитать прибыль по месяцам.",
      "Summarize the ledger and calculate monthly profit.",
    ],
  },
  {
    id: "suppliers",
    title: ["Предложения поставщиков", "Supplier quotes"],
    description: [
      "Сопоставить артикулы и найти лучшую цену с доставкой.",
      "Match SKUs and compare landed unit costs.",
    ],
  },
  {
    id: "api",
    title: ["Доставки через API", "Shipment API"],
    description: [
      "Превратить вложенный JSON отправлений в реестр.",
      "Turn nested shipment JSON into a dispatch register.",
    ],
  },
  {
    id: "batch",
    title: ["Пакет Excel и CSV", "Excel and CSV batch"],
    description: [
      "Собрать реестр из двух файлов и удалить повторы.",
      "Combine two files into one register and remove duplicates.",
    ],
  },
];

function sheet(
  name: string,
  format: Format,
  grid: Grid,
  steps: Step[] = [],
): Table {
  return {
    ...grid,
    id: crypto.randomUUID(),
    name,
    format,
    steps,
    demo: true,
    updated: Date.now(),
  };
}
function result(
  view: SampleResult["view"],
  first: Table,
  ...sources: Table[]
): SampleResult {
  return { view, primary: first.id, tables: [first, ...sources] };
}

type Product = {
  sku: string;
  item: Text;
  category: Text;
  cost: number;
  stock: number;
  reserved: number;
  minimum: number;
};
const ceramics: Text = ["Керамика", "Ceramics"],
  textiles: Text = ["Текстиль", "Textiles"],
  wood: Text = ["Дерево", "Woodware"];
const products: Product[] = [
  {
    sku: "FM-101",
    item: ["Кружка «Терра», 280 мл", "Terra mug, 280 ml"],
    category: ceramics,
    cost: 465,
    stock: 32,
    reserved: 12,
    minimum: 18,
  },
  {
    sku: "FM-102",
    item: ["Тарелка «Соль», 21 см", "Salt plate, 21 cm"],
    category: ceramics,
    cost: 580,
    stock: 19,
    reserved: 12,
    minimum: 16,
  },
  {
    sku: "FM-103",
    item: ["Пиала «Маяк», 350 мл", "Beacon bowl, 350 ml"],
    category: ceramics,
    cost: 395,
    stock: 30,
    reserved: 27,
    minimum: 24,
  },
  {
    sku: "FM-104",
    item: ["Ваза «Линия», 18 см", "Line vase, 18 cm"],
    category: ceramics,
    cost: 1140,
    stock: 14,
    reserved: 1,
    minimum: 6,
  },
  {
    sku: "FM-201",
    item: ["Салфетки льняные, 2 шт.", "Linen napkins, pair"],
    category: textiles,
    cost: 410,
    stock: 22,
    reserved: 11,
    minimum: 12,
  },
  {
    sku: "FM-202",
    item: ["Дорожка «Лён», 160 см", "Flax runner, 160 cm"],
    category: textiles,
    cost: 860,
    stock: 18,
    reserved: 3,
    minimum: 10,
  },
  {
    sku: "FM-203",
    item: ["Полотенце «Сетка», 50 см", "Mesh towel, 50 cm"],
    category: textiles,
    cost: 325,
    stock: 42,
    reserved: 8,
    minimum: 15,
  },
  {
    sku: "FM-301",
    item: ["Доска «Ясень», 32 см", "Ash board, 32 cm"],
    category: wood,
    cost: 740,
    stock: 11,
    reserved: 6,
    minimum: 10,
  },
  {
    sku: "FM-302",
    item: ["Поднос «Радиус», 28 см", "Radius tray, 28 cm"],
    category: wood,
    cost: 680,
    stock: 13,
    reserved: 2,
    minimum: 8,
  },
];
function shop(t: Translate): SampleResult {
  const cost = t("Себестоимость", "Cost"),
    retail = t("Розничная цена", "Retail price");
  const grid: Grid = {
    cols: [
      t("Артикул", "SKU"),
      t("Товар", "Item"),
      t("Категория", "Category"),
      cost,
    ],
    rows: products.map((p) => [p.sku, t(...p.item), t(...p.category), p.cost]),
  };
  const steps: Step[] = [
    { kind: "price", col: cost, target: retail, percent: 45 },
    { kind: "sort", col: retail, desc: true },
  ];
  return result(
    "editor",
    sheet(
      t("Коллекция · розничный прайс", "Collection · retail prices"),
      "XLSX",
      runRecipe(grid, steps),
      steps,
    ),
    sheet(
      t("Коллекция · себестоимость", "Collection · wholesale costs"),
      "XLSX",
      grid,
    ),
  );
}
function warehouse(t: Translate): SampleResult {
  const order = t("К заказу", "To order");
  const grid: Grid = {
    cols: [
      t("Артикул", "SKU"),
      t("Товар", "Item"),
      t("На складе", "On hand"),
      t("В резерве", "Reserved"),
      t("Минимум", "Minimum"),
      t("Доступно", "Available"),
      order,
    ],
    rows: products.map((p) => {
      const available = p.stock - p.reserved;
      return [
        p.sku,
        t(...p.item),
        p.stock,
        p.reserved,
        p.minimum,
        available,
        Math.max(p.minimum - available, 0),
      ];
    }),
  };
  const steps: Step[] = [
    { kind: "filter", col: order, op: "gt", value: "0" },
    { kind: "sort", col: order, desc: true },
  ];
  return result(
    "editor",
    sheet(
      t("Заявка на пополнение", "Replenishment order"),
      "XLSX",
      runRecipe(grid, steps),
      steps,
    ),
    sheet(
      t("Остатки · центральный склад", "Central warehouse stock"),
      "XLSX",
      grid,
    ),
  );
}
function crm(t: Translate): SampleResult {
  const contacts: [Text, string, Text][] = [
    [["Вера Лесина", "Vera Lesina"], "vera.l", ["Казань", "Kazan"]],
    [["Дмитрий Ким", "Dmitri Kim"], "d.kim", ["Пермь", "Perm"]],
    [["Ольга Речная", "Olga Rechnaya"], "o.r", ["Тула", "Tula"]],
    [["Денис Берестов", "Denis Berestov"], "db", ["Москва", "Moscow"]],
    [["Ирина Волкова", "Irina Volkova"], "irina.v", ["Самара", "Samara"]],
    [["Лев Зарин", "Lev Zarin"], "l.z", ["Вологда", "Vologda"]],
  ];
  const rows: Cell[][] = contacts.map(([name, alias, city], i) => [
    "CL-" + (710 + i),
    t(...name),
    alias + "@example.com",
    t(...city),
  ]);
  // Duplicate submissions from a second signup form vary in case and whitespace.
  const source: Grid = {
    cols: [
      t("Клиент", "Client ID"),
      t("Имя", "Name"),
      "Email",
      t("Город", "City"),
    ],
    rows: [
      ...rows,
      [...rows[1].slice(0, 2), "  D.KIM@EXAMPLE.COM ", rows[1][3]],
      [...rows[3].slice(0, 2), "Db@EXAMPLE.COM", rows[3][3]],
      ["CL-719", t("Анна Север", "Anna Sever"), "", t("Тула", "Tula")],
    ],
  };
  const normalized: Grid = {
    ...source,
    rows: source.rows.map(([id, name, email, city]) => [
      id,
      name,
      String(email).trim().toLowerCase(),
      city,
    ]),
  };
  const steps: Step[] = [
    { kind: "filter", col: "Email", op: "filled", value: "" },
    { kind: "dedupe", col: "Email" },
  ];
  return result(
    "editor",
    sheet(
      t("CRM · очищенные контакты", "CRM · cleaned contacts"),
      "JSON",
      runRecipe(normalized, steps),
    ),
    sheet(t("Контакты из форм", "Signup submissions"), "JSON", source),
  );
}

const months = [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
];
const channels: Text[] = [
  ["Сайт", "Web store"],
  ["Маркетплейс", "Marketplace"],
  ["Шоурум", "Showroom"],
];
type Transaction = {
  date: string;
  month: string;
  channel: string;
  category: string;
  orders: number;
  revenue: number;
  expenses: number;
  profit: number;
  product: string;
};
function transactions(t: Translate): Transaction[] {
  return months.flatMap((month, period) =>
    channels.flatMap((channel, index) =>
      products.map((p, productIndex) => {
        const orders =
          2 + ((productIndex * 3 + index * 5 + period * 2) % 9) + period;
        const units = orders + ((productIndex + period) % 4);
        const revenue = Math.round(p.cost * 1.65 * units);
        const expenses =
          p.cost * units + Math.round(revenue * [0.035, 0.11, 0.045][index]);
        const day = String(1 + ((productIndex * 3 + index) % 28)).padStart(
          2,
          "0",
        );
        return {
          date: month + "-" + day,
          month,
          channel: t(...channel),
          category: t(...p.category),
          product: p.sku,
          orders,
          revenue,
          expenses,
          profit: revenue - expenses,
        };
      }),
    ),
  );
}
function sales(t: Translate): SampleResult {
  const details = transactions(t),
    group = new Map<string, Transaction>();
  for (const row of details) {
    const key = [row.month, row.channel, row.category].join("|");
    const sum = group.get(key);
    if (sum) {
      sum.orders += row.orders;
      sum.revenue += row.revenue;
      sum.expenses += row.expenses;
      sum.profit += row.profit;
    } else group.set(key, { ...row });
  }
  const names = [
    t("Месяц", "Month"),
    t("Выручка", "Revenue"),
    t("Канал", "Channel"),
    t("Категория", "Category"),
    t("Заказы", "Orders"),
    t("Расходы", "Expenses"),
    t("Прибыль", "Profit"),
  ];
  const aggregate: Grid = {
    cols: names,
    rows: [...group.values()].map((r) => [
      r.month,
      r.revenue,
      r.channel,
      r.category,
      r.orders,
      r.expenses,
      r.profit,
    ]),
  };
  const source: Grid = {
    cols: [t("Дата", "Date"), t("Артикул", "SKU"), ...names],
    rows: details.map((r) => [
      r.date,
      r.product,
      r.month,
      r.revenue,
      r.channel,
      r.category,
      r.orders,
      r.expenses,
      r.profit,
    ]),
  };
  return result(
    "analytics",
    sheet(t("Продажи по каналам", "Sales by channel"), "XLSX", aggregate),
    sheet(t("Реестр продаж", "Sales register"), "XLSX", source),
  );
}
function finance(t: Translate): SampleResult {
  const details = transactions(t),
    ledger: Cell[][] = [],
    summary: Cell[][] = [];
  for (const month of months) {
    const monthly = details.filter((r) => r.month === month);
    const entries: [string, number, number][] = channels.map((labels) => {
      const category = t(...labels);
      const records = monthly.filter((r) => r.channel === category);
      return [
        category,
        records.reduce((sum, r) => sum + r.revenue, 0),
        records.reduce((sum, r) => sum + r.expenses, 0),
      ];
    });
    entries.push(
      [t("Аренда мастерской", "Workshop rent"), 0, 42000],
      [
        t("Упаковка", "Packaging"),
        0,
        monthly.reduce((sum, r) => sum + r.orders * 24, 0),
      ],
    );
    for (const [category, income, expense] of entries)
      ledger.push([month, category, income, expense, income - expense]);
    const revenue = entries.reduce((total, r) => total + r[1], 0),
      expenses = entries.reduce((total, r) => total + r[2], 0);
    summary.push([month, revenue, expenses, revenue - expenses]);
  }
  const [month, revenue, expenses, profit] = [
    t("Месяц", "Month"),
    t("Выручка", "Revenue"),
    t("Расходы", "Expenses"),
    t("Прибыль", "Profit"),
  ];
  return result(
    "analytics",
    sheet(t("Прибыль по месяцам", "Monthly profit"), "XLSX", {
      cols: [month, revenue, expenses, profit],
      rows: summary,
    }),
    sheet(
      t("Доходы и затраты по статьям", "Income and expense ledger"),
      "XLSX",
      {
        cols: [month, t("Категория", "Category"), revenue, expenses, profit],
        rows: ledger,
      },
    ),
  );
}
function suppliers(t: Translate): SampleResult {
  const sku = t("Артикул", "SKU"),
    code = t("Код позиции", "Item code"),
    priceA = t("Цена • Керамика", "Kiln price"),
    freightA = t("Доставка • Керамика", "Kiln freight"),
    priceB = t("Цена • Контур", "Contour price"),
    freightB = t("Доставка • Контур", "Contour freight");
  const left: Grid = {
    cols: [sku, t("Товар", "Item"), priceA, freightA],
    rows: products.map((p, i) => [
      p.sku,
      t(...p.item),
      p.cost,
      28 + (i % 3) * 8,
    ]),
  };
  const right: Grid = {
    cols: [code, priceB, freightB],
    rows: products
      .map((p, i) => [p.sku, p.cost + [-30, 15, 5][i % 3], 24 + (i % 2) * 6])
      .reverse(),
  };
  const joint = joinTables(left, right, sku, code);
  const best = t("Лучшая цена", "Best unit cost");
  const comparison: Grid = {
    cols: [...joint.cols, best, t("Поставщик", "Supplier")],
    rows: joint.rows.map((row) => {
      const a = Number(row[2]) + Number(row[3]),
        b = Number(row[4]) + Number(row[5]);
      return [
        ...row,
        Math.min(a, b),
        a <= b ? t("Керамика", "Kiln") : t("Контур", "Contour"),
      ];
    }),
  };
  return result(
    "editor",
    sheet(
      t("Закупки · сопоставление цен", "Purchasing · quote comparison"),
      "XLSX",
      comparison,
    ),
    sheet(t("Керамика · предложение", "Kiln · quote"), "XLSX", left),
    sheet(t("Контур · предложение", "Contour · quote"), "CSV", right),
  );
}

async function api(t: Translate): Promise<SampleResult> {
  const embedded =
    !globalThis.location ||
    !/^https?:$/.test(location.protocol) ||
    globalThis.document
      ?.querySelector('meta[name="datamaster-distribution"]')
      ?.getAttribute("content") === "offline";
  let payload = offlineShipments;
  if (!embedded) {
    const endpoint = new URL("samples/shipments.json", location.href);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("HTTP " + response.status);
    payload = await response.json();
  }
  const records = payload?.data?.shipments;
  if (!Array.isArray(records) || !records.length) throw Error("json");
  const grid = fromJSON(
    records.map((row) => ({
      [t("Отправление", "Shipment")]: row.ref,
      [t("Заказ", "Order")]: row.order,
      [t("Направление", "Destination")]: t(row.route.ru, row.route.en),
      [t("Сервис", "Service")]:
        row.service === "express"
          ? t("Экспресс", "Express")
          : t("Стандарт", "Standard"),
      [t("Мест", "Packages")]: row.packages,
      [t("Стоимость доставки", "Shipping fee")]: row.fee,
      [t("Дата отправки", "Dispatched")]: row.dispatched,
    })),
  );
  const label = embedded
    ? t("Доставки · встроенный JSON", "Shipments · bundled JSON")
    : t(
        "Доставки · GET /samples/shipments.json",
        "Shipments · GET /samples/shipments.json",
      );
  return result("editor", sheet(label, embedded ? "JSON" : "API", grid));
}

async function batch(t: Translate): Promise<SampleResult> {
  const order = t("Накладная", "Invoice"),
    columns = [
      order,
      t("Отделение", "Branch"),
      t("Дата", "Date"),
      t("Сумма", "Amount"),
    ];
  const north = t("Север", "North"),
    south = t("Юг", "South");
  const first: Grid = {
    cols: columns,
    rows: [
      ["00121", north, "2026-10-25", 3560],
      ["00122", north, "2026-10-25", 2140],
      ["00123", north, "2026-10-26", 4785],
    ],
  };
  const second: Grid = {
    cols: [columns[2], order, columns[3], columns[1]],
    rows: [
      ["2026-10-26", "00123", 4785, north],
      ["2026-10-26", "00124", 2910, south],
      ["2026-10-26", "00125", 1695, south],
      ["2026-10-27", "00126", 5025, south],
    ],
  };
  const [book, csv] = await Promise.all([
    encode(first, "XLSX"),
    encode(second, "CSV"),
  ]);
  const [[left], [right]] = await Promise.all([
    parseFile(new File([book], "invoices-north.xlsx")),
    parseFile(new File([csv], "invoices-south.csv")),
  ]);
  const appended = appendTables(left, right),
    amount = appended.cols.indexOf(columns[3]);
  const normalized: Grid = {
    ...appended,
    rows: appended.rows.map((row) =>
      row.map((cell, i) => (i === amount ? Number(cell) : cell)),
    ),
  };
  const step: Step = { kind: "dedupe", col: order };
  return result(
    "editor",
    sheet(
      t("Накладные · сводный реестр", "Invoices · consolidated register"),
      "XLSX",
      applyStep(normalized, step),
      [step],
    ),
    sheet(left.name, left.format, left),
    sheet(right.name, right.format, right),
  );
}

export async function launchSample(
  id: string,
  en: boolean,
): Promise<SampleResult> {
  const t: Translate = (ru, english) => (en ? english : ru);
  switch (id) {
    case "shop":
      return shop(t);
    case "stock":
      return warehouse(t);
    case "crm":
      return crm(t);
    case "sales":
      return sales(t);
    case "finance":
      return finance(t);
    case "suppliers":
      return suppliers(t);
    case "api":
      return api(t);
    case "batch":
      return batch(t);
    default:
      throw Error("sample");
  }
}
