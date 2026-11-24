import { num, str, type Table, type Grid } from "../core";
import { aggregate } from "./process";
import type { ChartConfig } from "./model";
export function defaultChart(a: Table): ChartConfig {
  const pick = (re: RegExp) => a.cols.find((c) => re.test(c)) || "";
  const measure =
    pick(/выручка|revenue|сумма|amount|продажная цена|^цена$|price/i) ||
    a.cols.find((_, i) =>
      a.rows.slice(0, 40).some((r) => typeof r[i] === "number"),
    ) ||
    a.cols[0];
  const date = pick(/месяц|month/i) || pick(/дата|^date/i);
  return {
    id: crypto.randomUUID(),
    name: "",
    sheetId: a.id,
    group: date || pick(/категор|categor|статус|status/i) || a.cols[0],
    measure,
    split: "",
    agg: "sum",
    chart: "bar",
    filterCol: "",
    filterValue: "",
    revenue: pick(/выручка|revenue|^сумма$|^amount$/i),
    cost: pick(/расходы|expenses|себестоимость|^cost$/i),
    profit: pick(/прибыль|profit/i),
    date,
  };
}
export function calculateReport(a: Grid, c: ChartConfig) {
  const fi = a.cols.indexOf(c.filterCol),
    data =
      !c.filterCol || !c.filterValue
        ? a
        : { ...a, rows: a.rows.filter((r) => str(r[fi]) === c.filterValue) };
  const pivot = aggregate(data, c.group, c.measure, c.agg, c.split),
    sum = (col: string) => {
      if (!col) return null;
      const i = data.cols.indexOf(col);
      if (i < 0) return null;
      let total = 0,
        count = 0;
      for (const row of data.rows) {
        const n = num(row[i]);
        if (Number.isFinite(n)) {
          total += n;
          count++;
        }
      }
      return count ? total : null;
    };
  const revenue = sum(c.revenue),
    cost = sum(c.cost),
    profit =
      sum(c.profit) ??
      (revenue != null && cost != null ? revenue - cost : null);
  let change: number | null = null,
    periods: string[] = [];
  if (
    c.date &&
    c.revenue &&
    data.cols.includes(c.date) &&
    data.cols.includes(c.revenue)
  ) {
    const di = data.cols.indexOf(c.date),
      mi = data.cols.indexOf(c.revenue),
      monthly = new Map<string, number>();
    for (const r of data.rows) {
      const d = /^(\d{4})-(0[1-9]|1[0-2])(?:-|$)/.exec(str(r[di])),
        n = num(r[mi]);
      if (d && Number.isFinite(n)) {
        const k = d[1] + "-" + d[2];
        monthly.set(k, (monthly.get(k) || 0) + n);
      }
    }
    periods = [...monthly.keys()].sort().slice(-2);
    if (periods.length === 2 && monthly.get(periods[0]) !== 0)
      change =
        (monthly.get(periods[1])! / Math.abs(monthly.get(periods[0])!) -
          Math.sign(monthly.get(periods[0])!)) *
        100;
  }
  return {
    pivot,
    revenue,
    cost,
    profit,
    change,
    periods,
    rows: data.rows.length,
  };
}
