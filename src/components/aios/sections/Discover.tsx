import { useState } from "react";
import { Card, Pill, PrimaryBtn, OutlineBtn, GhostBtn, Input } from "../ui";
import { RefreshCw, Plus, X, ChevronDown, Instagram, Youtube, TrendingUp } from "lucide-react";

const TABS = ["My Posts", "Competitors", "Trends", "All Ideas"] as const;
type Tab = (typeof TABS)[number];

export function Discover() {
  const [tab, setTab] = useState<Tab>("My Posts");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">Discover</h1>
        <p className="mt-1 text-sm text-mute">
          Ideator + Trend Spy — find your next hit.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 rounded-full px-4 text-sm transition ${
              tab === t
                ? "bg-lime font-bold text-app"
                : "border border-line bg-transparent text-fg2 hover:border-lime hover:text-lime"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "My Posts" && <MyPosts />}
      {tab === "Competitors" && <Competitors />}
      {tab === "Trends" && <Trends />}
      {tab === "All Ideas" && (
        <AllIdeas selected={selected} onSelect={setSelected} />
      )}

      {selected && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-lime bg-surface px-4 py-3 backdrop-blur sm:px-6 lg:left-[200px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-fg">
              <span className="text-mute">Selected:</span>{" "}
              <span className="break-words text-fg">{selected}</span>
            </div>
            <PrimaryBtn>Open Script →</PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function MyPosts() {
  const metrics = [
    { label: "Avg Likes", value: "2.3k" },
    { label: "Avg Comments", value: "184" },
    { label: "Best Hour", value: "7 PM" },
    { label: "Best Day", value: "Thu" },
  ];
  const posts = [
    { cap: "3 mistakes I made in year 1…", likes: "4.2k" },
    { cap: "How I plan a week in 20 mins", likes: "3.8k" },
    { cap: "Behind the shot: the reel setup", likes: "3.1k" },
    { cap: "My morning stack (2 mins)", likes: "2.7k" },
    { cap: "One tool changed everything", likes: "2.4k" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-fg">@enzo.creates</div>
          <button className="text-lime hover:text-lime2">
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-[11px] text-mute">{m.label}</div>
              <div className="mt-1 text-base font-bold text-fg">{m.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-mute">
          Top Posts
        </div>
        <div className="mt-2 space-y-2">
          {posts.map((p, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
              <div className="h-10 w-10 rounded-lg bg-cardx" />
              <div className="flex-1 truncate text-xs text-fg2">{p.cap}</div>
              <div className="text-xs font-semibold text-lime">{p.likes}</div>
            </div>
          ))}
        </div>
        <PrimaryBtn className="mt-5 w-full">Generate Ideas from My Posts</PrimaryBtn>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-semibold text-fg">AI Generated Ideas</div>
        <div className="mt-2 text-xs text-mute">From your top-performing posts</div>
        <div className="mt-4 space-y-3">
          {[
            "5 mistakes I fixed after year 2 (bigger lessons)",
            "The 20-minute weekly planning ritual",
            "My camera setup, but way simpler this time",
          ].map((idea, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-sm text-fg">{idea}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill>Reel</Pill>
                <Pill>Listicle</Pill>
                <Pill>Education</Pill>
              </div>
              <div className="mt-3">
                <GhostBtn>Select This Idea →</GhostBtn>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Competitors() {
  const [comps, setComps] = useState(["@dailyloop", "@shotbrief", "@mkt.arc"]);
  const [add, setAdd] = useState("");
  const grid = [
    { user: "@dailyloop", likes: "12.4k", cap: "3 things I stopped doing this month…" },
    { user: "@shotbrief", likes: "9.8k", cap: "The 'boring' hook that outperformed all clips" },
    { user: "@mkt.arc", likes: "8.2k", cap: "Why creators quit at month 4 (and don't)" },
    { user: "@dailyloop", likes: "7.4k", cap: "One line changed my open rate 3x" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <Card className="p-4">
        <div className="mb-3 flex gap-2">
          <Input
            placeholder="@handle"
            value={add}
            onChange={(e) => setAdd(e.target.value)}
          />
          <button
            onClick={() => {
              if (add) setComps([...comps, add.startsWith("@") ? add : `@${add}`]);
              setAdd("");
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lime text-app"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {comps.map((c) => (
            <div key={c} className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
              <div className="flex-1 text-sm text-fg">{c}</div>
              <button className="rounded border border-line bg-surface px-2 py-1 text-[11px] text-lime hover:border-lime">
                Scrape
              </button>
              <button
                onClick={() => setComps(comps.filter((x) => x !== c))}
                className="text-mute hover:text-err"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <PrimaryBtn className="mt-4 w-full">Scrape All</PrimaryBtn>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-cardx p-3">
          <select className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg2">
            <option>Sort: Likes</option>
            <option>Sort: Comments</option>
            <option>Sort: ER</option>
          </select>
          <select className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg2">
            <option>All formats</option>
            <option>Reel</option>
            <option>Carousel</option>
          </select>
          <select className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg2">
            <option>Last 30 days</option>
            <option>Last 7 days</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {grid.map((g, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg2">{g.user}</span>
                <span className="text-xs font-bold text-lime">{g.likes}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-fg2">{g.cap}</div>
              <div className="mt-3">
                <GhostBtn>Inspire Idea</GhostBtn>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Trends() {
  return (
    <div className="space-y-3">
      <Collapse title="Instagram Trends" Icon={Instagram}>
        <div className="flex flex-wrap gap-2">
          {["#morningreset", "#creatordiary", "#studyvlog", "#bts", "#weekplan"].map(
            (t, i) => (
              <span
                key={t}
                className={`rounded-full border px-3 py-1 text-xs ${
                  i === 0
                    ? "border-lime text-lime"
                    : "border-line bg-surface text-fg2"
                }`}
              >
                {t}
              </span>
            ),
          )}
        </div>
        <div className="mt-4 space-y-2">
          {[
            { cap: "Morning reset routine (60s)", likes: "18k" },
            { cap: "Behind the scenes of week planning", likes: "12k" },
          ].map((p, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
              <div className="h-10 w-10 rounded-lg bg-cardx" />
              <div className="flex-1 text-xs text-fg2">{p.cap}</div>
              <div className="text-xs font-semibold text-lime">{p.likes}</div>
            </div>
          ))}
        </div>
      </Collapse>

      <Collapse title="YouTube Shorts" Icon={Youtube}>
        <div className="space-y-2">
          {[
            { t: "1 productivity hack that actually works", v: "1.2M" },
            { t: "How I edit reels in 4 minutes", v: "820k" },
            { t: "Camera settings for cinematic bts", v: "440k" },
          ].map((v, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
              <div className="h-12 w-20 rounded-md bg-cardx" />
              <div className="flex-1">
                <div className="line-clamp-2 text-xs text-fg">{v.t}</div>
                <div className="text-[11px] text-mute">{v.v} views</div>
              </div>
              <OutlineBtn className="h-8 px-3 text-xs">Get Ideas</OutlineBtn>
            </div>
          ))}
        </div>
      </Collapse>

      <Collapse title="Google Trends" Icon={TrendingUp}>
        <div className="space-y-2">
          {[
            { k: "morning routine", s: 88 },
            { k: "content planning", s: 72 },
            { k: "reels editing", s: 65 },
            { k: "creator workflow", s: 40 },
          ].map((k) => (
            <div key={k.k} className="flex items-center gap-3">
              <div className="w-40 text-xs text-fg2">{k.k}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-lime"
                  style={{ width: `${k.s}%` }}
                />
              </div>
              <div className="w-10 text-right text-xs font-semibold text-lime">
                {k.s}
              </div>
            </div>
          ))}
        </div>
      </Collapse>

      <PrimaryBtn className="w-full">Generate Trend Ideas</PrimaryBtn>
    </div>
  );
}

function Collapse({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof Instagram;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon size={16} className="text-lime" />
          {title}
        </div>
        <ChevronDown
          size={16}
          className={`text-mute transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

const IDEAS = [
  {
    rank: 1,
    text: "The 20-minute weekly planning ritual for solo creators",
    source: "My Posts",
    inspired: "@enzo.creates",
    why: "Matches your top-performing 'workflow' pillar",
    tags: ["Educational", "Reel", "Workflow"],
  },
  {
    rank: 2,
    text: "3 things I stopped doing this month (and grew 3x)",
    source: "Competitor",
    inspired: "@dailyloop",
    why: "High engagement listicle format, aligns with your voice",
    tags: ["Story", "Reel", "Growth"],
  },
  {
    rank: 3,
    text: "Morning reset routine that actually sticks (60s)",
    source: "Trend",
    inspired: "#morningreset",
    why: "Trending hashtag with rising volume this week",
    tags: ["Motivation", "Reel", "Lifestyle"],
  },
  {
    rank: 4,
    text: "The 'boring' hook that outperformed all my clips",
    source: "Competitor",
    inspired: "@shotbrief",
    why: "Meta-content about hooks performs well in your niche",
    tags: ["Educational", "Reel", "Copywriting"],
  },
];

function AllIdeas({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-cardx p-3">
        <select className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg2">
          <option>Source: All</option>
          <option>My Posts</option>
          <option>Competitor</option>
          <option>Trend</option>
        </select>
        <select className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg2">
          <option>Sort: Best Match</option>
          <option>Engagement</option>
          <option>Newest</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {IDEAS.map((i) => {
          const isSel = selected === i.text;
          const sourceColor =
            i.source === "My Posts"
              ? "text-[#7BB6FF] border-[#7BB6FF]"
              : i.source === "Competitor"
              ? "text-[#C494FF] border-[#C494FF]"
              : "text-warn border-warn";
          return (
            <div
              key={i.rank}
              className={`relative rounded-xl border p-4 transition-all ${
                isSel
                  ? "border-lime bg-cardx shadow-[0_0_24px_rgba(82,255,46,0.25)]"
                  : "border-line bg-cardx hover:border-line2"
              }`}
            >
              <div className="absolute right-3 top-4 max-w-[35%]">
                <span
                  className={`rounded-full border bg-transparent px-2 py-0.5 text-[10px] font-semibold ${sourceColor}`}
                >
                  {i.source}
                </span>
              </div>
              <div className="text-2xl font-bold text-lime">#{i.rank}</div>
              <div className="mt-2 break-words pr-20 text-[15px] text-fg">{i.text}</div>
              <div className="mt-1 text-xs text-fg2">inspired by {i.inspired}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {i.tags.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
              <div className="mt-3 text-xs text-mute">Why it works: {i.why}</div>
              <button
                onClick={() => onSelect(isSel ? null : i.text)}
                className={`mt-4 h-10 w-full rounded-lg text-sm font-semibold transition ${
                  isSel
                    ? "bg-lime text-app"
                    : "border border-lime text-lime hover:bg-[rgba(82,255,46,0.08)]"
                }`}
              >
                {isSel ? "✓ Selected — Go to Script →" : "Select & Continue →"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
