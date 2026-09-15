import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { Layers, Plug } from "lucide-react";
import { Card, EmptyState, Pill, Progress } from "../ui";

/**
 * Series — not built yet, and honest about it.
 *
 * There is no `series` concept in the schema: library items carry a
 * `content_pillar` (education, inspiration, …), which groups content by topic,
 * not by the recurring format a "series" means. Rather than relabel pillars as
 * series, this page states what is missing and shows the real pillar breakdown
 * next to it, clearly labelled.
 */

const NEEDED = [
  "A grouping on library items — e.g. a `series` column (or a `series` table with items attached).",
  "A way to pick the series while generating, so new ideas and scripts inherit it.",
  "The Series page then lists each series with its item count and the stage each item reached.",
];

type PillarData = {
  ok: boolean;
  pillars: { pillar: string; count: number }[];
  total: number;
};

export function SeriesScreen() {
  const [data, setData] = useState<PillarData | null>(null);

  useEffect(() => {
    apiFetch("/api/pillars")
      .then((r) => r.json())
      .then((json) => setData(json as PillarData))
      .catch(() => {
        /* the breakdown simply stays empty */
      });
  }, []);

  const max = Math.max(1, ...(data?.pillars ?? []).map((p) => p.count));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Series</h1>
        <p className="mt-0.5 text-sm text-mute">
          Group recurring content — a format you publish again and again.
        </p>
      </div>

      <EmptyState
        icon={<Layers size={22} />}
        title="Not built yet"
        description="Nothing is grouped into series, because the app has no series concept stored anywhere. Rather than invent groupings, here is exactly what is missing — and what your library really contains today."
      />

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-mute">
          <Plug size={13} /> What it needs
        </div>
        <ul className="space-y-2">
          {NEEDED.map((n) => (
            <li key={n} className="flex gap-2 text-sm">
              <span className="text-mute">•</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <div className="mb-1 text-xs uppercase tracking-wide text-mute">What exists today</div>
        <p className="mb-4 text-sm text-mute">
          Your library by content pillar — a real breakdown from {data?.total ?? 0} stored items.
          These are topics, not series.
        </p>

        {(data?.pillars?.length ?? 0) === 0 ? (
          <p className="text-sm text-mute">No library items yet.</p>
        ) : (
          <div className="space-y-3">
            {data!.pillars.map((p) => (
              <div key={p.pillar}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="capitalize">{p.pillar}</span>
                  <span className="text-mute">{p.count}</span>
                </div>
                <Progress value={Math.round((p.count / max) * 100)} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {(data?.pillars ?? []).map((p) => (
            <Pill key={p.pillar}>
              {p.pillar} · {p.count}
            </Pill>
          ))}
        </div>
      </Card>
    </div>
  );
}
