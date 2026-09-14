import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen, Link2, Plus, Unlink } from "lucide-react";
import {
  Card,
  EmptyState,
  GhostBtn,
  Input,
  Modal,
  OutlineBtn,
  Pill,
  PrimaryBtn,
  Select,
  SkeletonCards,
} from "../ui";

/**
 * Projects — real rows from D1, with linked content.
 *
 * The filter chips and sort box used to be decorative (every group re-fetched
 * `?status=` and ignored both), the cards read fields the API never sent, and
 * "Open →" did nothing. All three are wired here, and projects can now actually
 * be created — nothing in the codebase wrote to the `projects` table before.
 */

type Item = { id: string; type: string; title: string };

type Project = {
  id: string;
  title: string;
  module: string;
  status: string;
  pipeline_step: string | null;
  created_at: number;
  updated_at: number;
  modifiedLabel: string;
  stage: number;
  items: Item[];
};

const FILTERS = ["All", "Ideator", "Script", "Storyboard", "Video Prompt", "Completed"];

const STAGES = ["Discover", "Script", "Storyboard", "Video Prompt", "Planner"];

const MODULES = ["Ideator", "Script", "Storyboard", "Video Prompt", "Planner"];

/** Where a linked library item lives, so "Open" goes somewhere real. */
const TYPE_ROUTE: Record<string, string> = {
  idea: "/ideator",
  script: "/script",
  storyboard: "/storyboard",
  video_prompt: "/video-prompt",
  character: "/characters",
};

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("modified");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/projects");
      const json = await res.json();
      setProjects(Array.isArray(json) ? json : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const rows = projects.filter((p) => {
      if (filter === "All") return true;
      if (filter === "Completed") return p.status === "completed";
      return p.module.toLowerCase() === filter.toLowerCase();
    });
    const sorted = [...rows];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "created") sorted.sort((a, b) => b.created_at - a.created_at);
    else sorted.sort((a, b) => b.updated_at - a.updated_at);
    return sorted;
  }, [projects, filter, sort]);

  const open = projects.find((p) => p.id === openId) ?? null;
  const inProgress = visible.filter((p) => p.status !== "completed");
  const completed = visible.filter((p) => p.status === "completed");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold text-fg">Projects</h1>
          <p className="mt-1 text-sm text-mute">Everything you're building, in one place.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-lime px-4 text-sm font-bold text-app transition-colors hover:bg-lime2"
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}>
              <Pill active={filter === f}>{f}</Pill>
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-sm text-fg2 outline-none focus:border-lime"
        >
          <option value="modified">Last modified</option>
          <option value="created">Date created</option>
          <option value="title">Title</option>
        </select>
      </div>

      {error ? (
        <Card className="p-4 text-sm text-err">
          Could not load projects.{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </Card>
      ) : loading ? (
        <SkeletonCards count={3} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={22} />}
          title="No projects yet"
          description="Create one to group the ideas, scripts and storyboards that belong together."
          action={
            <PrimaryBtn onClick={() => setCreating(true)}>
              <Plus size={16} /> New Project
            </PrimaryBtn>
          }
        />
      ) : (
        <>
          <ProjectGroup
            label="In Progress"
            projects={inProgress}
            emptyMessage={
              filter === "All"
                ? "No active projects — start one from New Project"
                : `No active projects match “${filter}”`
            }
            onOpen={setOpenId}
          />
          <ProjectGroup
            label="Completed"
            projects={completed}
            emptyMessage="No completed projects yet"
            muted
            onOpen={setOpenId}
          />
        </>
      )}

      <NewProjectModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          setCreating(false);
          setProjects((prev) => [p, ...prev]);
        }}
      />

      <ProjectDetail project={open} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function ProjectGroup({
  label,
  projects,
  emptyMessage,
  muted = false,
  onOpen,
}: {
  label: string;
  projects: Project[];
  emptyMessage: string;
  muted?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-fg2">{label}</h2>
      {projects.length === 0 ? (
        <EmptyState icon={<FolderOpen size={22} />} message={emptyMessage} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="p-5 transition-all hover:-translate-y-px hover:border-line2 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
            >
              <Pill variant={muted ? "default" : "accent"}>{p.module}</Pill>
              <div className="mt-3 text-base font-semibold text-fg">{p.title}</div>
              <div className="mt-1 text-[11px] text-mute">
                {p.modifiedLabel} · {p.items.length} linked{" "}
                {p.items.length === 1 ? "item" : "items"}
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                {STAGES.map((s, i) => (
                  <span
                    key={s}
                    title={s}
                    className={`h-2 w-2 rounded-full ${i < p.stage ? "bg-lime" : "bg-line2"}`}
                  />
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <GhostBtn onClick={() => onOpen(p.id)}>Open →</GhostBtn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function NewProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [title, setTitle] = useState("");
  const [module, setModule] = useState(MODULES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      setError("Give the project a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), module }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "Could not create the project");
        return;
      }
      onCreated(json.project as Project);
      setTitle("");
      setModule(MODULES[0]);
    } catch (err: any) {
      setError(err?.message ?? "Could not create the project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Project"
      footer={
        <>
          <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create project"}
          </PrimaryBtn>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-mute">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 5 AI tools I actually use"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-mute">
            Starting module
          </label>
          <Select value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-xs text-err">{error}</p>}
      </div>
    </Modal>
  );
}

function ProjectDetail({
  project,
  onClose,
  onChanged,
}: {
  project: Project | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [library, setLibrary] = useState<Item[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    Promise.all(
      ["idea", "script", "storyboard", "video_prompt"].map((t) =>
        fetch(`/api/library/${t}`).then((r) => r.json()),
      ),
    )
      .then((rows) => {
        if (cancelled) return;
        const items = rows
          .flatMap((r) => (Array.isArray(r) ? r : []))
          .map((r: any) => ({
            id: String(r.id),
            type: String(r.type),
            title: String(r.title ?? "Untitled"),
          }));
        setLibrary(items);
      })
      .catch(() => {
        /* the picker stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project) return null;

  const linkedIds = new Set(project.items.map((i) => i.id));
  const attachable = library.filter((i) => !linkedIds.has(i.id));

  const link = async (itemId: string, action: "link" | "unlink") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectId: project.id, itemId }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "Could not update the link");
        return;
      }
      onChanged();
    } catch (err: any) {
      setError(err?.message ?? "Could not update the link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={project.title}
      footer={<OutlineBtn onClick={onClose}>Close</OutlineBtn>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-mute">
          <Pill variant="accent">{project.module}</Pill>
          <span>{project.modifiedLabel}</span>
          <span>
            Stage {project.stage}/{STAGES.length} · {STAGES[project.stage - 1] ?? STAGES[0]}
          </span>
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-mute">Linked content</div>
          {project.items.length === 0 ? (
            <p className="text-sm text-mute">
              Nothing linked yet — attach an idea or script below and it will show up here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {project.items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
                >
                  <Link2 size={14} className="shrink-0 text-mute" />
                  <Link
                    to={(TYPE_ROUTE[i.type] ?? "/library") as any}
                    className="min-w-0 flex-1 truncate text-sm text-fg hover:text-lime"
                  >
                    {i.title}
                  </Link>
                  <span className="shrink-0 text-[11px] text-mute">{i.type.replace("_", " ")}</span>
                  <button
                    onClick={() => link(i.id, "unlink")}
                    disabled={busy}
                    title="Detach from this project"
                    className="shrink-0 text-mute transition-colors hover:text-err disabled:opacity-50"
                  >
                    <Unlink size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-mute">Attach content</div>
          <div className="flex gap-2">
            <Select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="min-w-0 flex-1"
            >
              <option value="">
                {attachable.length === 0
                  ? "Nothing left to attach"
                  : "Choose an idea, script or storyboard…"}
              </option>
              {attachable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.type}: {i.title.slice(0, 50)}
                </option>
              ))}
            </Select>
            <OutlineBtn
              onClick={() => {
                if (!pick) return;
                const id = pick;
                setPick("");
                link(id, "link");
              }}
              disabled={busy || !pick}
            >
              Attach
            </OutlineBtn>
          </div>
        </div>

        {error && <p className="text-xs text-err">{error}</p>}
      </div>
    </Modal>
  );
}
