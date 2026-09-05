import { createFileRoute } from "@tanstack/react-router";
import { HookScoreboard } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/hook-scoreboard")({
  head: () => ({
    meta: [
      { title: "Hook Scoreboard — Jepy Labs" },
      { name: "description", content: "Ranked hook performance, coming soon." },
      { property: "og:title", content: "Hook Scoreboard — Jepy Labs" },
      { property: "og:description", content: "Ranked hook performance, coming soon." },
    ],
  }),
  component: HookScoreboardPage,
});

function HookScoreboardPage() {
  return <HookScoreboard />;
}
