import { createFileRoute } from "@tanstack/react-router";
import { DailyBrief } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/daily-brief")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Daily Brief" },
      { name: "description", content: "Your morning content briefing, coming soon." },
      { property: "og:title", content: "JepyLabs — Daily Brief" },
      { property: "og:description", content: "Your morning content briefing, coming soon." },
    ],
  }),
  component: DailyBriefPage,
});

function DailyBriefPage() {
  return <DailyBrief />;
}
