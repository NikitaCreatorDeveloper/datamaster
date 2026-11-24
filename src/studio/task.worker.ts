import { execute } from "./taskRunner";
import type { Task } from "./tasks";
self.onmessage = async ({ data }: { data: Task }) => {
  try {
    const result = await execute(data, (p) =>
      self.postMessage({ type: "progress", p }),
    );
    self.postMessage({ type: "done", result });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : "data",
    });
  }
};
