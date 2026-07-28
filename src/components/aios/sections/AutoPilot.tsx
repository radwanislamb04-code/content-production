import { Card, PrimaryBtn, OutlineBtn } from "../ui";
import { RefreshCw, Clock, Bot, Send } from "lucide-react";

const STATUS = [
  { icon: RefreshCw, label: "Last Scrape", time: "07:04 AM", status: "OK" },
  { icon: Bot, label: "Last Agent Run", time: "08:12 AM", status: "OK" },
  { icon: Send, label: "Last Report", time: "Yesterday 8:00 PM", status: "OK" },
];

const SCHEDULE = [
  { time: "07:00", task: "Instagram Scrape (Apify)", status: "done" },
  { time: "08:00", task: "All Agents Run", status: "done" },
  { time: "20:00", task: "Telegram Daily Report", status: "pending" },
];

const LOGS = [
  "[07:00:01] Scraper started: 3 handles queued",
  "[07:00:14] @dailyloop — 12 posts fetched",
  "[07:00:28] @shotbrief — 9 posts fetched",
  "[07:00:41] @mkt.arc — 11 posts fetched",
  "[07:04:12] Scraper finished — 32 rows written",
  "[08:00:02] Agents queue: ideator, trend-spy, analyst",
  "[08:03:38] Ideator produced 12 candidates",
  "[08:07:22] Trend-spy: 8 trends matched",
  "[08:12:04] Analyst report ready",
  "[20:00:00] Waiting for daily report window…",
];

export function AutoPilot() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUS.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-lime">
              <s.icon size={16} />
            </div>
            <div className="mt-3 text-xs text-fg2">{s.label}</div>
            <div className="mt-1 text-sm text-mute">{s.time}</div>
            <span className="mt-2 inline-block rounded-full border border-[rgba(82,255,46,0.3)] bg-[rgba(82,255,46,0.1)] px-2 py-0.5 text-[11px] text-lime">
              {s.status}
            </span>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <Clock size={16} className="text-lime" /> Daily Schedule
        </div>
        <div className="space-y-2">
          {SCHEDULE.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3"
            >
              <div className="w-16 text-sm font-bold text-lime">{r.time}</div>
              <div className="flex-1 text-sm text-fg">{r.task}</div>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  r.status === "done" ? "bg-lime" : "bg-warn"
                }`}
              />
            </div>
          ))}
        </div>
      </Card>

      <PrimaryBtn className="h-12 w-full">Run Full Pipeline Now</PrimaryBtn>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <OutlineBtn>Run Scraper</OutlineBtn>
        <OutlineBtn>Run Agents</OutlineBtn>
        <OutlineBtn>Send Report</OutlineBtn>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-fg">Logs</div>
          <button className="text-mute hover:text-lime">
            <RefreshCw size={14} />
          </button>
        </div>
        <div
          className="max-h-[280px] overflow-y-auto rounded-lg bg-surface p-3 font-mono text-[13px] leading-relaxed text-fg2 aios-scroll"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {LOGS.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}
