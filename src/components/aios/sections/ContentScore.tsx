import { Card, OutlineBtn } from "../ui";

const SCORE = 82;
const GRADE = "A-";

const BREAKDOWN = [
  { label: "Hook Strength", value: 88 },
  { label: "Retention", value: 76 },
  { label: "Viral Potential", value: 74 },
  { label: "Script Quality", value: 90 },
];

const IMPROVEMENTS = [
  { p: "high", text: "Front-load the hook with a specific number (e.g. 20 minutes) in the first 1.5s." },
  { p: "med", text: "Add one on-screen text pattern-interrupt around 5s to lift retention." },
  { p: "low", text: "Consider a second CTA variant testing 'save' vs 'follow'." },
];

const P_COLOR = {
  high: "bg-err",
  med: "bg-warn",
  low: "bg-lime",
} as const;

export function ContentScore() {
  const c = 2 * Math.PI * 60;
  const dash = (SCORE / 100) * c;
  return (
    <div className="mx-auto w-full max-w-[700px] space-y-4">
      <Card className="p-8 text-center">
        <div className="mx-auto grid h-40 w-40 place-items-center">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="60" stroke="#1E2622" strokeWidth="10" fill="none" />
            <circle
              cx="80"
              cy="80"
              r="60"
              stroke="#52FF2E"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              transform="rotate(-90 80 80)"
              style={{ filter: "drop-shadow(0 0 8px rgba(82,255,46,0.4))" }}
            />
            <text
              x="80"
              y="86"
              textAnchor="middle"
              fill="#F3F5F2"
              fontSize="42"
              fontWeight="700"
            >
              {SCORE}
            </text>
          </svg>
        </div>
        <div className="mt-2 text-3xl font-bold text-lime">{GRADE}</div>
        <div className="mt-1 text-xs text-mute">
          Based on current script + storyboard
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {BREAKDOWN.map((b) => (
          <Card key={b.label} className="p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg">{b.label}</span>
              <span className="font-bold text-lime">{b.value}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-lime" style={{ width: `${b.value}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-3 text-sm font-semibold text-fg">Improvements</div>
        <div className="space-y-3">
          {IMPROVEMENTS.map((i, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${P_COLOR[i.p as keyof typeof P_COLOR]}`}
              />
              <div className="text-sm text-fg">{i.text}</div>
            </div>
          ))}
        </div>
      </Card>

      <OutlineBtn className="w-full">Re-score</OutlineBtn>
    </div>
  );
}
