import { Card, OutlineBtn } from "../ui";
import { TrendingUp, Heart, MessageCircle, Clock } from "lucide-react";

const STATS = [
  { icon: TrendingUp, label: "Avg Engagement", value: "6.2%" },
  { icon: Heart, label: "Avg Likes", value: "2.3k" },
  { icon: MessageCircle, label: "Avg Comments", value: "184" },
  { icon: Clock, label: "Best Hour", value: "7 PM" },
];

const POSTS = [
  { rank: 1, cap: "3 mistakes I made in year 1…", likes: "4.2k", comments: "312", er: "8.4%" },
  { rank: 2, cap: "How I plan a week in 20 mins", likes: "3.8k", comments: "268", er: "7.9%" },
  { rank: 3, cap: "Behind the shot: the reel setup", likes: "3.1k", comments: "210", er: "6.8%" },
  { rank: 4, cap: "My morning stack (2 mins)", likes: "2.7k", comments: "186", er: "6.1%" },
  { rank: 5, cap: "One tool changed everything", likes: "2.4k", comments: "152", er: "5.7%" },
];

const OBS = [
  "Personal-story hooks outperform tutorial hooks by 34% in your feed.",
  "Reels posted Thu 7pm get 2.1× your median engagement — try to concentrate drops there.",
  "Carousels with 5 slides retain 22% more than 3-slide versions. Extend when possible.",
];

export function Analyst() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-lime">
              <s.icon size={16} />
            </div>
            <div className="mt-4 text-xs text-fg2">{s.label}</div>
            <div className="text-[clamp(1.5rem,5vw,2rem)] font-bold text-lime">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">
            Top 5 Posts
          </div>
          <div className="w-full overflow-x-auto aios-scroll">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-surface text-left text-xs text-fg2">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Caption</th>
                <th className="px-4 py-2">Likes</th>
                <th className="px-4 py-2">Comments</th>
                <th className="px-4 py-2">ER</th>
              </tr>
            </thead>
            <tbody>
              {POSTS.map((p, i) => (
                <tr
                  key={p.rank}
                  className={`border-t border-line ${
                    i % 2 === 0 ? "bg-cardx" : "bg-surface"
                  }`}
                >
                  <td className="px-4 py-3 text-fg2">{p.rank}</td>
                  <td className="px-4 py-3 text-fg">{p.cap}</td>
                  <td className="px-4 py-3 text-fg2">{p.likes}</td>
                  <td className="px-4 py-3 text-fg2">{p.comments}</td>
                  <td className="px-4 py-3 font-semibold text-lime">{p.er}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold text-fg">Observations</div>
          <div className="space-y-3">
            {OBS.map((o, i) => (
              <div key={i} className="flex gap-3">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-lime text-xs font-bold text-lime">
                  {i + 1}
                </div>
                <div className="text-sm text-fg">{o}</div>
              </div>
            ))}
          </div>
          <OutlineBtn className="mt-4 w-full">Refresh Analysis</OutlineBtn>
        </Card>
      </div>
    </div>
  );
}
