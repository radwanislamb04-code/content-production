import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const QUOTES: { text: string; author: string }[] = [
  { text: "Consistency beats intensity.", author: "James Clear" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Small progress is still progress.", author: "Unknown" },
  { text: "Discipline creates freedom.", author: "Jocko Willink" },
  { text: "Focus on systems, not goals.", author: "James Clear" },
  {
    text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.",
    author: "Stephen King",
  },
  {
    text: "The way to get started is to quit talking and begin doing.",
    author: "Walt Disney",
  },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
];

export function QuoteBar() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * QUOTES.length));
  }, []);

  const next = () => {
    setFade(false);
    setTimeout(() => {
      setIndex((prev) => (prev + 1) % QUOTES.length);
      setFade(true);
    }, 160);
  };

  const q = QUOTES[index];

  return (
    <div className="aios-glass flex items-center gap-3 rounded-lg border border-line bg-cardx px-3 py-2">
      <span
        className={`min-w-0 flex-1 truncate text-[13px] text-fg2 transition-opacity duration-200 ${
          fade ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="mr-1.5">💬</span>
        <span className="text-fg">“{q.text}”</span>
        <span className="text-mute"> — {q.author}</span>
      </span>
      <button
        onClick={next}
        aria-label="Show another quote"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-surface text-fg2 transition-colors hover:border-lime hover:text-lime"
      >
        <RefreshCw size={13} />
      </button>
    </div>
  );
}
