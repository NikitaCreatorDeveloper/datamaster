import type { Grid, Table, Step } from "../core";
import type { ChartConfig, Stage } from "./model";
export type InputTable = Grid & { name: string; format?: Table["format"] };
export type Task =
  | { op: "projectImport"; file: File }
  | {
      op: "editCells";
      table: Table;
      edits: { r: number; c: number; value: string }[];
    }
  | { op: "import"; files: File[] }
  | { op: "quality"; grid: Grid }
  | { op: "report"; grid: Grid; config: ChartConfig }
  | { op: "formula"; table: Table }
  | {
      op: "pipeline";
      inputs: InputTable[];
      stages: Stage[];
      combine: boolean;
      mappings?: Record<string, string[]>;
    }
  | {
      op: "combine";
      left: Grid;
      right: Grid;
      mode: string;
      ka: string;
      kb: string;
      en: boolean;
    }
  | { op: "recipe"; grid: Grid; steps: Step[] }
  | { op: "book"; tables: Table[] }
  | { op: "encode"; grid: Grid; format: "CSV" | "JSON" | "XLSX" };
export type Progress = {
  done: number;
  total: number;
  name: string;
  rows: number;
  sample: Grid;
};
