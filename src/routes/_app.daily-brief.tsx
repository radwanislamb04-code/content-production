import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { DailyBrief } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/daily-brief")({
  head: () => ({
    meta: [
      { title: "Content OS — Daily Brief" },
      { name: "description", content: "Your morning content briefing, coming soon." },
      { property: "og:title", content: "Content OS — Daily Brief" },
      { property: "og:description", content: "Your morning content briefing, coming soon." },
    ],
  }),
  component: DailyBriefPage,
});

function DailyBriefPage() {
  // The brief is where ideas start, so each bullet can hand itself to the Ideator.
  const onNav = useSectionNav();
  return <DailyBrief onNav={onNav} />;
}
