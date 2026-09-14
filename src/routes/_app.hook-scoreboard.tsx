import { createFileRoute } from "@tanstack/react-router";
import { HookScoreboardScreen } from "@/components/aios/sections/HookScoreboardScreen";

export const Route = createFileRoute("/_app/hook-scoreboard")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Hook Scoreboard" },
      { name: "description", content: "Your written hooks and how your published posts performed." },
      { property: "og:title", content: "JepyLabs — Hook Scoreboard" },
      { property: "og:description", content: "Your written hooks and how your published posts performed." },
    ],
  }),
  component: HookScoreboardPage,
});

function HookScoreboardPage() {
  return <HookScoreboardScreen />;
}
