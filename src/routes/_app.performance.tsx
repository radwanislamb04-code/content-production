import { createFileRoute } from "@tanstack/react-router";
import { Analyst } from "@/components/aios/sections/Analyst";

export const Route = createFileRoute("/_app/performance")({
  head: () => ({
    meta: [
      { title: "Content OS — Performance" },
      { name: "description", content: "See which posts perform and why, at a glance." },
      { property: "og:title", content: "Content OS — Performance" },
      { property: "og:description", content: "See which posts perform and why, at a glance." },
    ],
  }),
  component: AnalystPage,
});

function AnalystPage() {
  return <Analyst />;
}
