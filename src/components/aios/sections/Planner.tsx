import { Card, PrimaryBtn, OutlineBtn } from "../ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Entry = { type: "Reel" | "Carousel" | "Story"; topic: string; time: string };

const WEEK: Record<string, Entry[]> = {
  Mon: [{ type: "Reel", topic: "20-min planning ritual", time: "7 PM" }],
  Tue: [{ type: "Story", topic: "BTS: desk setup", time: "12 PM" }],
  Wed: [{ type: "Carousel", topic: "5 mistakes I fixed", time: "6 PM" }],
  Thu: [{ type: "Reel", topic: "Morning reset", time: "7 PM" }],
  Fri: [],
  Sat: [{ type: "Reel", topic: "Weekly recap", time: "10 AM" }],
  Sun: [{ type: "Story", topic: "Ask me anything", time: "9 PM" }],
};

const STYLES = {
  Reel: "bg-[rgba(82,255,46,0.15)] border-lime",
  Carousel: "bg-[rgba(246,196,83,0.15)] border-warn",
  Story: "bg-[rgba(167,172,167,0.15)] border-mute",
} as const;

export function Planner() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="grid h-8 w-8 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime">
            <ChevronLeft size={16} />
          </button>
          <div className="text-lg font-semibold text-fg">Week of Aug 5 – Aug 11</div>
          <button className="grid h-8 w-8 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex gap-2">
          <OutlineBtn>Add Manual</OutlineBtn>
          <PrimaryBtn>Generate 7-Day Plan</PrimaryBtn>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface">
          {DAYS.map((d) => (
            <div
              key={d}
              className="border-r border-line px-3 py-2 text-xs font-semibold text-fg2 last:border-r-0"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`min-h-[140px] border-r border-line p-2 last:border-r-0 ${
                i > 0 ? "" : ""
              }`}
            >
              {WEEK[d].length === 0 ? (
                <button className="grid h-full w-full place-items-center rounded-md border border-dashed border-line2 text-mute hover:border-lime hover:text-lime">
                  <Plus size={16} />
                </button>
              ) : (
                <div className="space-y-2">
                  {WEEK[d].map((e, idx) => (
                    <div
                      key={idx}
                      className={`group cursor-pointer rounded-md border p-2 transition hover:translate-y-[-1px] hover:shadow-lg ${STYLES[e.type]}`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-fg2">
                        {e.type}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-fg">{e.topic}</div>
                      <div className="mt-1 text-[10px] text-mute">{e.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
