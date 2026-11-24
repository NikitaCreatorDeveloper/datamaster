import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { seeds } from "../demo";
import { recipe, type Project } from "./projectFormat";
export {
  projectFile,
  pipelineFile,
  decodeProject,
  decodePipeline,
  type Project,
} from "./projectFormat";
export function freshProject(name: string, withDemo = false): Project {
  return {
    id: crypto.randomUUID(),
    name,
    tables: withDemo ? seeds() : [],
    recipes: [],
    pipelines: [],
    boards: [],
  };
}
type WorkspaceLocation = { view: string; sheet: string };
type Archive = {
  projects: Project[];
  active: string;
  location?: WorkspaceLocation;
};
const CONSENT = "dm.projects.consent";
function readConsent() {
  try {
    return localStorage.getItem(CONSENT) === "yes";
  } catch {
    return false;
  }
}
function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("DataMaster-Studio", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("session");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadArchive(): Promise<
  { revision: number; data: Archive } | undefined
> {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("session"),
      req = tx.objectStore("session").get("workspace");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
async function writeArchive(data: Archive | null, revision: number) {
  const db = await connect();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("session", "readwrite"),
      store = tx.objectStore("session"),
      req = store.get("workspace");
    let conflict = false;
    req.onsuccess = () => {
      if ((req.result?.revision ?? 0) !== revision) {
        conflict = true;
        tx.abort();
        return;
      }
      if (data) store.put({ revision: revision + 1, data }, "workspace");
      else store.delete("workspace");
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(Error(conflict ? "conflict" : "storage"));
    };
    tx.onerror = () => db.close();
  });
}
export function useProjects() {
  const [workspace, setWorkspace] = useState<Archive>(() => {
    const p = freshProject("DataMaster", true);
    try {
      p.recipes = z
        .array(recipe)
        .parse(JSON.parse(localStorage.getItem("dm.recipes") || "[]"));
    } catch {
      /* Legacy preferences are optional. */
    }
    return { projects: [p], active: p.id };
  });
  const [consent, setConsent] = useState(readConsent),
    [ready, setReady] = useState(() => !readConsent()),
    [status, setStatus] = useState<
      "memory" | "saving" | "saved" | "error" | "conflict"
    >("memory");
  const revision = useRef(0),
    queue = useRef(Promise.resolve()),
    latest = useRef(0),
    locked = useRef(false),
    lastWritten = useRef<Archive | null>(null);
  useEffect(() => {
    if (!readConsent()) return;
    let live = true;
    loadArchive()
      .then((saved) => {
        if (live && saved) {
          if (
            !saved.data.projects?.length ||
            !saved.data.projects.some((p) => p.id === saved.data.active)
          )
            throw Error("projectFormat");
          revision.current = saved.revision;
          lastWritten.current = saved.data;
          setWorkspace(saved.data);
          setStatus("saved");
        }
      })
      .catch(() => {
        if (live) {
          locked.current = true;
          setStatus("error");
        }
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (
      !ready ||
      !consent ||
      locked.current ||
      workspace === lastWritten.current
    )
      return;
    const job = ++latest.current;
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      if (job !== latest.current || locked.current) return;
      try {
        await writeArchive(workspace, revision.current);
        revision.current++;
        lastWritten.current = workspace;
        if (job === latest.current) setStatus("saved");
      } catch (e) {
        locked.current = true;
        setStatus(
          e instanceof Error && e.message === "conflict" ? "conflict" : "error",
        );
      }
    });
  }, [workspace, ready, consent]);
  const project = workspace.projects.find((p) => p.id === workspace.active)!;
  const patch = (changes: Partial<Project>) => {
    const id = project.id;
    setWorkspace((w) => ({
      ...w,
      projects: w.projects.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }));
  };
  const add = (newProject: Project) =>
    setWorkspace((w) => ({
      active: newProject.id,
      location: { view: "projects", sheet: newProject.tables[0]?.id ?? "" },
      projects: [...w.projects, newProject],
    }));
  const select = (id: string) =>
    setWorkspace((w) =>
      w.projects.some((p) => p.id === id)
        ? {
            ...w,
            active: id,
            location: {
              view: "projects",
              sheet: w.projects.find((p) => p.id === id)?.tables[0]?.id ?? "",
            },
          }
        : w,
    );
  const remove = (id: string) =>
    setWorkspace((w) => {
      const projects = w.projects.filter((p) => p.id !== id);
      if (!projects.length) projects.push(freshProject("DataMaster"));
      return {
        projects,
        active: w.active === id ? projects[0].id : w.active,
        location:
          w.active === id
            ? { view: "projects", sheet: projects[0].tables[0]?.id ?? "" }
            : w.location,
      };
    });
  const location = workspace.location ?? {
    view: "home",
    sheet: project.tables[0]?.id ?? "",
  };
  function navigate(changes: Partial<WorkspaceLocation>) {
    const id = project.id;
    setWorkspace((w) => {
      if (w.active !== id) return w;
      const current = w.location ?? location;
      return { ...w, location: { ...current, ...changes } };
    });
  }
  async function saving(enabled: boolean) {
    if (enabled) {
      localStorage.setItem(CONSENT, "yes");
      setConsent(true);
      return;
    }
    ++latest.current;
    await queue.current;
    await writeArchive(null, revision.current);
    revision.current = 0;
    lastWritten.current = null;
    locked.current = false;
    localStorage.removeItem(CONSENT);
    setConsent(false);
    setStatus("memory");
  }
  return {
    projects: workspace.projects,
    project,
    location,
    navigate,
    patch,
    add,
    select,
    remove,
    consent,
    ready,
    status,
    saving,
  };
}
