import { useState } from "react";
import { Card, GhostBtn, EmptyState, SkeletonCards, Pill } from "../ui";
import type { SectionId } from "../Sidebar";
import { useApi } from "@/hooks/useApi";
import { FolderOpen, Plus } from "lucide-react";
import { toast } from "sonner";

type Project = {
  id: string;
  title: string;
  module: string;
  modifiedLabel: string;
  stage: number;
};

const FILTERS = [
  "All",
  "Ideator",
  "Script",
  "Storyboard",
  "Video Prompt",
  "Completed",
];

const STAGES = ["Discover", "Script", "Storyboard", "Video Prompt", "Planner"];

export function Projects({
  onNav,
}: {
  onNav: (id: SectionId) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("modified");

  const startProject = () => {
    onNav("analyzer");
    toast("New project started — add your idea in Video Analyzer");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold text-fg">Projects</h1>
          <p className="mt-1 text-sm text-mute">
            Everything you're building, in one place.
          </p>
        </div>
        <button
          onClick={startProject}
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

      <ProjectGroup
        label="In Progress"
        status="active"
        emptyMessage="No active projects — start one from New Project"
      />
      <ProjectGroup
        label="Completed"
        status="completed"
        emptyMessage="No completed projects yet"
        muted
      />
    </div>
  );
}

function ProjectGroup({
  label,
  status,
  emptyMessage,
  muted = false,
}: {
  label: string;
  status: string;
  emptyMessage: string;
  muted?: boolean;
}) {
  const { data, loading, error } = useApi<Project[]>(
    `/api/projects?status=${status}`,
  );

  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-fg2">{label}</h2>
      {loading ? (
        <SkeletonCards count={3} />
      ) : error || !data?.length ? (
        <EmptyState icon={<FolderOpen size={22} />} message={emptyMessage} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <Card
              key={p.id}
              className="p-5 transition-all hover:-translate-y-px hover:border-line2 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
            >
              <Pill variant={muted ? "default" : "accent"}>{p.module}</Pill>
              <div className="mt-3 text-base font-semibold text-fg">
                {p.title}
              </div>
              <div className="mt-1 text-[11px] text-mute">
                {p.modifiedLabel}
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                {STAGES.map((s, i) => (
                  <span
                    key={s}
                    title={s}
                    className={`h-2 w-2 rounded-full ${
                      i < p.stage ? "bg-lime" : "bg-line2"
                    }`}
                  />
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <GhostBtn>Open →</GhostBtn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
