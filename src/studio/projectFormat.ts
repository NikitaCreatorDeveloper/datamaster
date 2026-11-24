import { z } from "zod";

import {
  type Table,
  type Recipe,
  LIMIT_COLS,
  LIMIT_ROWS,
  LIMIT_CELLS,
  headers,
} from "../core";

import type { ChartConfig, Pipeline } from "./model";
import { coords, recalculate } from "./formulas";
const text = z.string().max(32767),
  name = z.string().min(1).max(512),
  col = z.string().max(32767),
  hex = z.string().regex(/^#[0-9a-f]{6}$/i),
  number = z.number().finite(),
  agg = z.enum(["sum", "mean", "min", "max", "count"]);
const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dedupe"), col }),
  z.object({ kind: z.literal("sort"), col, desc: z.boolean() }),
  z.object({
    kind: z.literal("filter"),
    col,
    op: z.enum(["contains", "equal", "gt", "lt", "filled"]),
    value: text,
  }),
  z.object({ kind: z.literal("replace"), col, find: name, value: text }),
  z.object({ kind: z.literal("price"), col, target: name, percent: number }),
  z.object({ kind: z.literal("markup"), col, sale: col, target: name }),
]);
const stageSchema = z.discriminatedUnion("kind", [
  ...stepSchema.options,
  z.object({
    kind: z.literal("normalize"),
    col,
    mode: z.enum(["phone", "date", "number", "text"]),
  }),
  z.object({ kind: z.literal("empty"), col }),
  z.object({
    kind: z.literal("split"),
    col,
    separator: name,
    left: name,
    right: name,
  }),
  z.object({
    kind: z.literal("concat"),
    col,
    other: col,
    separator: text,
    target: name,
  }),
  z.object({ kind: z.literal("profit"), col, cost: col, target: name }),
  z.object({ kind: z.literal("pivot"), col, measure: col, agg }),
  z.object({
    kind: z.literal("export"),
    format: z.enum(["CSV", "JSON", "XLSX"]),
  }),
]);
export const recipe = z.object({
  id: name,
  name,
  steps: z.array(stepSchema).max(100),
});
const pipe = z.object({
  id: name,
  name,
  stages: z.array(stageSchema).min(1).max(60),
  source: z
    .object({
      ids: z.array(name).max(150),
      mode: z.enum(["sheet", "sheets", "files"]).optional(),
      columns: z.array(z.array(col).max(300)).max(150).optional(),
      combine: z.boolean(),
      mappings: z
        .record(z.string().regex(/^\d+$/), z.array(col).max(300))
        .optional(),
    })
    .optional(),
});
const chart = z.object({
  id: name,
  name: text,
  sheetId: name,
  group: col,
  measure: col,
  split: col,
  agg,
  chart: z.enum(["bar", "line", "pie"]),
  filterCol: col,
  filterValue: text,
  revenue: col,
  cost: col,
  profit: col,
  date: col,
});
const ref = z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}$/);
const style = z.object({
  type: z
    .enum(["auto", "text", "number", "date", "currency", "percent"])
    .optional(),
  color: hex.optional(),
  fill: hex.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  border: z.boolean().optional(),
  font: z.string().max(100).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});
const meta = z.object({
  tabName: z.string().max(2048).optional(),
  formulas: z.record(ref, z.string().startsWith("=").max(4096)).optional(),
  styles: z.record(ref, style).optional(),
  widths: z
    .record(z.string().regex(/^\d+$/), number.min(40).max(600))
    .optional(),
  heights: z
    .record(z.string().regex(/^\d+$/), number.min(8).max(250))
    .optional(),
  frozenRows: number.int().min(0).max(100).optional(),
  frozenCols: number.int().min(0).max(50).optional(),
  rules: z
    .array(
      z.object({
        col,
        kind: z.enum(["duplicate", "empty", "equal", "greater"]),
        value: text,
        color: hex,
      }),
    )
    .max(100)
    .optional(),
});
const table = z.object({
  id: name,
  name: z.string().min(1).max(2048),
  format: z.enum(["XLSX", "CSV", "JSON", "API"]),
  updated: number,
  demo: z.boolean().optional(),
  steps: z.array(stepSchema).max(1000),
  cols: z.array(col).min(1).max(LIMIT_COLS),
  rows: z
    .array(
      z.array(z.union([text, number, z.boolean(), z.null()])).max(LIMIT_COLS),
    )
    .max(LIMIT_ROWS),
  meta: meta.optional(),
});
const projectSchema = z.object({
  id: name,
  name,
  tables: z.array(table).max(150),
  recipes: z.array(recipe).max(500),
  pipelines: z.array(pipe).max(500),
  boards: z.array(chart).max(100),
});
export type Project = {
  id: string;
  name: string;
  tables: Table[];
  recipes: Recipe[];
  pipelines: Pipeline[];
  boards: ChartConfig[];
};
export const projectFile = (project: Project) => ({
  application: "DataMaster",
  version: 2,
  project,
});
export function decodeProject(data: unknown): Project {
  const parsed = z
    .object({
      application: z.literal("DataMaster"),
      version: z.literal(2),
      project: projectSchema,
    })
    .safeParse(data);
  if (!parsed.success) throw Error("projectFormat");
  const p = parsed.data.project;
  if (new Set(p.tables.map((x) => x.id)).size !== p.tables.length)
    throw Error("projectFormat");
  let cells = 0;
  for (const s of p.tables) {
    cells += s.rows.length * s.cols.length;
    if (
      cells > 3_000_000 ||
      s.rows.length * s.cols.length > LIMIT_CELLS ||
      s.rows.some((r) => r.length !== s.cols.length) ||
      headers(s.cols).some((v, i) => v !== s.cols[i])
    )
      throw Error("projectFormat");
    for (const key of [
      ...Object.keys(s.meta?.styles ?? {}),
      ...Object.keys(s.meta?.formulas ?? {}),
    ]) {
      const [r, c] = coords(key);
      if (r < 0 || r >= s.rows.length || c >= s.cols.length)
        throw Error("projectFormat");
    }
  }
  return { ...p, tables: p.tables.map(recalculate) };
}
export function decodePipeline(data: unknown): Pipeline {
  const p = z
    .object({
      application: z.literal("DataMaster"),
      version: z.literal(2),
      pipeline: pipe,
    })
    .safeParse(data);
  if (!p.success) throw Error("projectFormat");
  return { ...p.data.pipeline, id: crypto.randomUUID() };
}
export const pipelineFile = (pipeline: Pipeline) => ({
  application: "DataMaster",
  version: 2,
  pipeline,
});
