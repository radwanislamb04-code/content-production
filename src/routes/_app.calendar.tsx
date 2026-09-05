import { createFileRoute } from "@tanstack/react-router";
import { Planner } from "@/components/aios/sections/Planner";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — JepyLabs" },
      { name: "description", content: "Plan and schedule your content releases week by week." },
      { property: "og:title", content: "Calendar — JepyLabs" },
      { property: "og:description", content: "Plan and schedule your content releases week by week." },
    ],
  }),
  component: PlannerPage,
});

function PlannerPage() {
  return <Planner />;
}
