export type CellType =
  | "auto"
  | "text"
  | "number"
  | "date"
  | "currency"
  | "percent";
export type CellStyle = {
  type?: CellType;
  color?: string;
  fill?: string;
  bold?: boolean;
  italic?: boolean;
  border?: boolean;
  font?: string;
  align?: "left" | "center" | "right";
};
export type Rule = {
  col: string;
  kind: "duplicate" | "empty" | "equal" | "greater";
  value: string;
  color: string;
};
export type SheetMeta = {
  tabName?: string;
  formulas?: Record<string, string>;
  styles?: Record<string, CellStyle>;
  widths?: Record<number, number>;
  heights?: Record<number, number>;
  frozenRows?: number;
  frozenCols?: number;
  rules?: Rule[];
};
export type Aggregation = "sum" | "mean" | "count" | "min" | "max";
export type ChartConfig = {
  id: string;
  name: string;
  sheetId: string;
  group: string;
  measure: string;
  split: string;
  agg: Aggregation;
  chart: "line" | "bar" | "pie";
  filterCol: string;
  filterValue: string;
  revenue: string;
  cost: string;
  profit: string;
  date: string;
};
import type { Step } from "../core";
export type Stage =
  | Step
  | {
      kind: "normalize";
      col: string;
      mode: "phone" | "date" | "number" | "text";
    }
  | {
      kind: "split";
      col: string;
      separator: string;
      left: string;
      right: string;
    }
  | {
      kind: "concat";
      col: string;
      other: string;
      separator: string;
      target: string;
    }
  | { kind: "profit"; col: string; cost: string; target: string }
  | { kind: "empty"; col: string }
  | { kind: "pivot"; col: string; measure: string; agg: Aggregation }
  | { kind: "export"; format: "CSV" | "JSON" | "XLSX" };
export type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
  source?: {
    ids: string[];
    mode?: "sheet" | "sheets" | "files";
    columns?: string[][];
    combine: boolean;
    mappings?: Record<string, string[]>;
  };
};
