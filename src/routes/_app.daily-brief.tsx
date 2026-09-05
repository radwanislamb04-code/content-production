import { createFileRoute } from "@tanstack/react-router";
import { DailyBrief } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/daily-brief")({
  head: () => ({
    meta: [
      { title: "Daily Brief — Jepy Labs" },
      { name: "description", content: "Your morning content briefing, coming soon." },
      { property: "og:title", content: "Daily Brief — Jepy Labs" },
      { property: "og:description", content: "Your morning content briefing, coming soon." },
    ],
  }),
  component: DailyBriefPage,
});

function DailyBriefPage() {
  return <DailyBrief />;
}
