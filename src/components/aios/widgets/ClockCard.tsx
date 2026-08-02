import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function greetingFor(h: number) {
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
}

export function ClockCard() {
  const [now, setNow] = useState<Date | null>(null);
  const [h24, setH24] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";

  const hours = now ? now.getHours() : 0;
  const displayHour = h24 ? hours : hours % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="aios-glass relative overflow-hidden rounded-xl border border-line bg-cardx p-4">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[rgba(82,255,46,0.10)] blur-2xl" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-mute">
          <Clock size={14} className="text-lime aios-spin-slow" />
          <span className="truncate">{greetingFor(hours)}</span>
        </div>
        <button
          onClick={() => setH24((v) => !v)}
          className="shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg2 transition-colors hover:border-lime hover:text-lime"
          aria-label="Toggle 12 or 24 hour time format"
        >
          {h24 ? "24h" : "12h"}
        </button>
      </div>

      <div className="mt-3 flex items-end gap-2 font-mono">
        <span
          key={now ? now.getSeconds() : "x"}
          className="aios-tick text-[clamp(1.9rem,8vw,2.5rem)] font-bold leading-none text-lime [text-shadow:0_0_18px_rgba(82,255,46,0.35)]"
        >
          {now ? `${pad(displayHour)}:${pad(now.getMinutes())}` : "--:--"}
        </span>
        <span className="pb-1 text-sm text-fg2">
          {now ? pad(now.getSeconds()) : "--"}
          {!h24 && now ? (hours < 12 ? " AM" : " PM") : ""}
        </span>
      </div>

      <div className="mt-3 border-t border-line pt-3 text-[12px] text-fg2">
        <div className="truncate">
          {now
            ? now.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "—"}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-mute">{tz}</div>
      </div>
    </div>
  );
}
