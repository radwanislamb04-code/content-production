import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export function HeroClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [tz, setTz] = useState("");

  useEffect(() => {
    setNow(new Date());
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);



  const hours = now ? now.getHours() : 0;
  const displayHour = hours % 12 || 12;

  return (
    <div className="text-left md:text-right">
      <div className="font-mono text-[clamp(1.5rem,7vw,2rem)] font-bold leading-none text-lime [text-shadow:0_0_18px_rgba(82,255,46,0.30)]">
        {now ? `${pad(displayHour)}:${pad(now.getMinutes())}` : "--:--"}
        <span className="ml-1.5 text-[0.5em] font-semibold text-fg2">
          {now ? (hours < 12 ? "AM" : "PM") : ""}
        </span>
      </div>
      <div className="mt-1.5 text-[12px] text-fg2">
        {now
          ? now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : "—"}
      </div>
      <div className="text-[11px] text-mute">{tz}</div>
    </div>
  );
}
