import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { Card, OutlineBtn, PrimaryBtn, Select } from "../ui";

/**
 * Calendar — the `planner` agent's output.
 *
 * The month lives in the `workspace` table as `calendar_YYYY-MM` (the pattern
 * the original design specified), so nothing here is hardcoded: no calendar is
 * stored until you generate one, and edits write straight back.
 */

type Entry = {
  date: string;
  weekday?: string;
  type: string;
  topic: string;
  pillar?: string;
  time: string;
};

type Calendar = {
  month: string;
  generated_at: number;
  pillars?: string[];
  entries: Entry[];
  /** Soft rules the model missed when it built the plan. */
  warnings?: string[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_STYLES: Record<string, string> = {
  Reel: "bg-[rgba(82,255,46,0.15)] border-lime",
  Carousel: "bg-[rgba(246,196,83,0.15)] border-warn",
  Story: "bg-[rgba(167,172,167,0.15)] border-mute",
};

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Monday-first grid of the month's dates, padded to whole weeks. */
function buildGrid(key: string): (string | null)[] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${key}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function Planner() {
  const [month, setMonth] = useState(monthKey());
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<{ date: string; type: string; topic: string; time: string } | null>(
    null,
  );

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace?key=calendar_${key}`);
      const json = await res.json();
      setCalendar((json?.value as Calendar) ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const generate = useCallback(async () => {
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "Plan generation failed");
        return;
      }
      setCalendar(json.calendar as Calendar);
    } catch (err: any) {
      setError(err?.message ?? "Plan generation failed");
    } finally {
      setBusy(null);
    }
  }, [month]);

  /** Write an edited calendar straight back to the workspace table. */
  const persist = useCallback(
    async (entries: Entry[]) => {
      const next: Calendar = {
        month,
        generated_at: calendar?.generated_at ?? Date.now(),
        pillars: calendar?.pillars,
        entries: [...entries].sort(
          (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
        ),
      };
      setCalendar(next);
      await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `calendar_${month}`, value: next }),
      });
    },
    [calendar?.generated_at, calendar?.pillars, month],
  );

  const grid = useMemo(() => buildGrid(month), [month]);
  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of calendar?.entries ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [calendar]);

  const addManual = useCallback(async () => {
    if (!manual || !manual.topic.trim()) return;
    const entry: Entry = {
      date: manual.date,
      type: manual.type,
      topic: manual.topic.trim(),
      time: manual.time,
      pillar: "manual",
    };
    await persist([...(calendar?.entries ?? []), entry]);
    setManual(null);
  }, [manual, calendar?.entries, persist]);

  const removeEntry = useCallback(
    async (target: Entry) => {
      const kind = window.confirm(`Remove “${target.topic}” from ${target.date}?`);
      if (!kind) return;
      await persist((calendar?.entries ?? []).filter((e) => e !== target));
    },
    [calendar?.entries, persist],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="grid h-8 w-8 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-lg font-semibold text-fg">{monthLabel(month)}</div>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
            className="grid h-8 w-8 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex gap-2">
          <OutlineBtn
            onClick={() =>
              setManual({ date: `${month}-01`, type: "Reel", topic: "", time: "21:00" })
            }
          >
            Add Manual
          </OutlineBtn>
          <PrimaryBtn onClick={generate} disabled={busy !== null}>
            {busy === "generate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {busy === "generate"
              ? "Planning…"
              : calendar
                ? "Regenerate month plan"
                : "Generate month plan"}
          </PrimaryBtn>
        </div>
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}

      {manual && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Add a post</span>
            <button
              onClick={() => setManual(null)}
              className="text-mute hover:text-fg"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <input
              type="date"
              value={manual.date}
              min={`${month}-01`}
              onChange={(e) => setManual({ ...manual, date: e.target.value })}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg"
            />
            <Select
              value={manual.type}
              onChange={(e: any) => setManual({ ...manual, type: e.target.value })}
            >
              <option value="Reel">Reel</option>
              <option value="Carousel">Carousel</option>
              <option value="Story">Story</option>
            </Select>
            <input
              type="time"
              value={manual.time}
              onChange={(e) => setManual({ ...manual, time: e.target.value })}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg"
            />
            <input
              placeholder="Topic"
              value={manual.topic}
              onChange={(e) => setManual({ ...manual, topic: e.target.value })}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg sm:col-span-1"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <PrimaryBtn onClick={addManual} disabled={!manual.topic.trim()}>
              Add to calendar
            </PrimaryBtn>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto aios-scroll">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7 border-b border-line bg-surface">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="border-r border-line px-3 py-2 text-xs font-semibold text-fg2 last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-mute">Loading…</div>
            ) : !calendar ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium">No plan for {monthLabel(month)} yet</p>
                <p className="mt-1 text-sm text-mute">
                  Press <em>Generate month plan</em> to have the planner lay it
                  out from your pillars and posting times.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {grid.map((date, i) => (
                  <div
                    key={i}
                    className="min-h-[140px] border-b border-r border-line p-2 last:border-r-0"
                  >
                    {date ? (
                      <>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] text-mute">
                            {Number(date.slice(-2))}
                          </span>
                          <button
                            onClick={() =>
                              setManual({
                                date,
                                type: "Reel",
                                topic: "",
                                time: "21:00",
                              })
                            }
                            className="text-mute opacity-0 transition hover:text-lime group-hover:opacity-100 sm:opacity-100"
                            aria-label={`Add post on ${date}`}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {(byDate.get(date) ?? []).map((e, idx) => (
                            <div
                              key={idx}
                              className={`group cursor-pointer rounded-md border p-1.5 transition hover:translate-y-[-1px] hover:shadow-lg ${
                                TYPE_STYLES[e.type] ?? TYPE_STYLES.Story
                              }`}
                              onClick={() => removeEntry(e)}
                              title="Click to remove"
                            >
                              <div className="text-[9px] font-semibold uppercase tracking-wide text-fg2">
                                {e.type}
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-[11px] text-fg">
                                {e.topic}
                              </div>
                              <div className="mt-0.5 text-[9px] text-mute">
                                {e.time}
                                {e.pillar ? ` · ${e.pillar}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="h-full opacity-40" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {calendar?.warnings && calendar.warnings.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-mute">
            <AlertTriangle className="h-3.5 w-3.5 text-warn" />
            Plan warnings
          </div>
          <ul className="space-y-1.5">
            {calendar.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-mute">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mute">
            Soft rules the model missed — edit or regenerate to fix them.
          </p>
        </Card>
      )}

      {calendar && (
        <div className="text-xs text-mute">
          {calendar.entries.length} entr
          {calendar.entries.length === 1 ? "y" : "ies"} ·{" "}
          {calendar.pillars?.length
            ? `pillars: ${calendar.pillars.join(", ")}`
            : "no pillars set"}{" "}
          · click a card to remove it
        </div>
      )}
    </div>
  );
}
