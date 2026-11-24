import { appendTables, compareTables, joinTables, runRecipe } from "../core";
import { parseFile, encode } from "../io";
import { calculateReport } from "./analytics";
import { recalculate } from "./formulas";
import { bare, quality, mappedAppend, runStage } from "./process";
import { editCells } from "./sheets";
import { encodeBook } from "./excel";
import type { Task, Progress, InputTable } from "./tasks";
export async function execute(
  task: Task,
  progress: (p: Progress) => void = () => {},
) {
  switch (task.op) {
    case "projectImport": {
      if (task.file.size > 64 * 1024 * 1024) throw Error("size");
      const { decodeProject } = await import("./projectFormat");
      return decodeProject(JSON.parse(await task.file.text()));
    }
    case "editCells":
      return editCells(task.table, task.edits);
    case "import": {
      const out = [];
      let bytes = 0,
        cells = 0;
      for (const f of task.files) {
        bytes += f.size;
        if (bytes > 64 * 1024 * 1024) throw Error("size");
        for (const s of await parseFile(f)) {
          cells += s.cols.length * s.rows.length;
          if (out.length >= 150 || cells > 3_000_000) throw Error("limits");
          out.push(s);
        }
      }
      return out;
    }
    case "quality":
      return quality(task.grid);
    case "report":
      return calculateReport(task.grid, task.config);
    case "formula":
      return recalculate(task.table);
    case "combine":
      return task.mode === "append"
        ? appendTables(task.left, task.right)
        : task.mode === "join"
          ? joinTables(task.left, task.right, task.ka, task.kb)
          : compareTables(task.left, task.right, task.ka, task.kb, task.en);
    case "recipe":
      return runRecipe(bare(task.grid), task.steps);
    case "book":
      return encodeBook(task.tables);
    case "encode":
      return encode(task.grid, task.format);
    case "pipeline": {
      const input = task.combine
        ? [
            {
              ...mappedAppend(
                task.inputs.map((grid, i) => ({
                  grid,
                  names: task.mappings?.[i],
                })),
              ),
              name: task.inputs[0].name,
            },
          ]
        : task.inputs;
      let done = 0;
      const total = input.length * task.stages.length,
        out: InputTable[] = [];
      for (const sheet of input) {
        let g = bare(sheet);
        for (const stage of task.stages) {
          try {
            g = runStage(g, stage);
          } catch (e) {
            throw Error(
              sheet.name +
                " / " +
                ((done % task.stages.length) + 1) +
                " / " +
                (e instanceof Error ? e.message : "data"),
            );
          }
          progress({
            done: ++done,
            total,
            name: sheet.name,
            rows: g.rows.length,
            sample: {
              cols: g.cols.slice(0, 8),
              rows: g.rows.slice(0, 4).map((r) => r.slice(0, 8)),
            },
          });
        }
        out.push({ ...g, name: sheet.name, format: "XLSX" });
      }
      return out;
    }
  }
}
