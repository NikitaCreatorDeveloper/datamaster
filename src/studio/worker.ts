import StudioWorker from "./task.worker?worker&inline";
import type { Task, Progress } from "./tasks";
export function background<T>(
  task: Task,
  signal?: AbortSignal,
  onProgress?: (p: Progress) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Error("abort"));
      return;
    }
    const worker = new StudioWorker();
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      finish();
      reject(Error("abort"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(Error("timeout"));
    }, 90000);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.(data.p);
        return;
      }
      finish();
      if (data.type === "error") reject(Error(data.message));
      else resolve(data.result);
    };
    worker.onerror = () => {
      finish();
      reject(Error("worker"));
    };
    try {
      worker.postMessage(task);
    } catch (e) {
      finish();
      reject(e);
    }
  });
}
