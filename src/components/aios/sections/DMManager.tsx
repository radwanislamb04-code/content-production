import { useState } from "react";
import { Card, PrimaryBtn, OutlineBtn, GhostBtn, Textarea } from "../ui";

const DMS = [
  { user: "@sara.k", msg: "Loved your last reel — can you share the notion template?", tone: "friendly" },
  { user: "@markr", msg: "Would you consider a collab for our creator summit?", tone: "professional" },
  { user: "@jules.p", msg: "How do you plan a week in 20 minutes exactly?", tone: "friendly" },
  { user: "@lin.io", msg: "Is your gear list public?", tone: "friendly" },
  { user: "@nova", msg: "Interested in sponsoring your next reel — details?", tone: "professional" },
];

export function DMManager() {
  const [i, setI] = useState(0);
  const dm = DMS[i];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
          Inbox
        </div>
        <div>
          {DMS.map((d, idx) => (
            <button
              key={d.user}
              onClick={() => setI(idx)}
              className={`flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left transition ${
                idx === i ? "border-l-2 border-l-lime bg-surface" : "hover:bg-surface"
              }`}
            >
              <div className="h-8 w-8 shrink-0 rounded-full bg-line" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{d.user}</div>
                <div className="truncate text-xs text-mute">{d.msg}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-fg">{dm.user}</div>
            <div className="mt-1 text-sm text-fg2">{dm.msg}</div>
          </div>
          <PrimaryBtn className="h-10">Generate All Replies</PrimaryBtn>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <div className="text-xs uppercase text-mute">Suggested Reply</div>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg2">
              {dm.tone}
            </span>
          </div>
          <Textarea
            defaultValue={
              dm.tone === "friendly"
                ? "So glad you liked it! Yep — I'll DM you the template link now 🙌"
                : "Thanks for reaching out — happy to explore. Sending my rate card and available windows shortly."
            }
            style={{ minHeight: 140 }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <OutlineBtn>Copy Reply</OutlineBtn>
          <GhostBtn>Regenerate</GhostBtn>
        </div>
      </Card>
    </div>
  );
}
