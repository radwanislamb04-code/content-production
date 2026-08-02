import { useEffect, useState } from "react";
import { Quote, RefreshCw, Copy, Check } from "lucide-react";

const QUOTES: { text: string; author: string }[] = [
  { text: "Consistency beats intensity.", author: "James Clear" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Small progress is still progress.", author: "Unknown" },
  { text: "Discipline creates freedom.", author: "Jocko Willink" },
  { text: "Focus on systems, not goals.", author: "James Clear" },
  { text: "You do not rise to the level of your goals, you fall to the level of your systems.", author: "James Clear" },
  { text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.", author: "Stephen King" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Motivation gets you going, habit keeps you growing.", author: "John C. Maxwell" },
];

const KEY = "jepy-quote";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function QuoteCard() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { day: string; i: number };
        if (saved.day === todayKey()) {
          setIndex(saved.i % QUOTES.length);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const i = Math.floor(Math.random() * QUOTES.length);
    setIndex(i);
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: todayKey(), i }));
    } catch {
      /* ignore */
    }
  }, []);

  const next = () => {
    setFade(false);
    setTimeout(() => {
      setIndex((prev) => {
        const i = (prev + 1) % QUOTES.length;
        try {
          localStorage.setItem(KEY, JSON.stringify({ day: todayKey(), i }));
        } catch {
          /* ignore */
        }
        return i;
      });
      setFade(true);
    }, 180);
  };

  const q = QUOTES[index];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`"${q.text}" — ${q.author}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="aios-glass group relative overflow-hidden rounded-xl border border-line bg-cardx p-4 transition-all duration-200 hover:border-[rgba(82,255,46,0.35)] hover:shadow-[0_0_0_1px_rgba(82,255,46,0.12)]">
      <div className="pointer-events-none absolute -right-8 bottom-0 h-24 w-24 rounded-full bg-[rgba(82,255,46,0.07)] blur-2xl" />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-mute">
        <Quote size={14} className="text-lime" />
        Daily Focus
      </div>

      <div
        className={`mt-3 transition-opacity duration-200 ${
          fade ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="text-[15px] font-medium leading-snug text-fg">
          “{q.text}”
        </p>
        <p className="mt-2 text-xs text-fg2">— {q.author}</p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={next}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg2 transition-colors hover:border-lime hover:text-lime"
        >
          <RefreshCw size={13} /> Next Quote
        </button>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg2 transition-colors hover:border-lime hover:text-lime"
        >
          {copied ? <Check size={13} className="text-lime" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
