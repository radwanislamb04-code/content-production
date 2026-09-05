import { createFileRoute } from "@tanstack/react-router";
import { HookScoreboard } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/hook-scoreboard")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Hook Scoreboard" },
      { name: "description", content: "Ranked hook performance, coming soon." },
      { property: "og:title", content: "JepyLabs — Hook Scoreboard" },
      { property: "og:description", content: "Ranked hook performance, coming soon." },
    ],
  }),
  component: HookScoreboardPage,
});

function HookScoreboardPage() {
  return <HookScoreboard />;
}
