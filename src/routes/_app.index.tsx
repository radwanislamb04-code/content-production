import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { Dashboard } from "@/components/aios/sections/Dashboard";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Dashboard" },
      { name: "description", content: "Your content pipeline, daily tasks and AI activity in one dark workspace." },
      { property: "og:title", content: "JepyLabs — Dashboard" },
      { property: "og:description", content: "Your content pipeline, daily tasks and AI activity in one dark workspace." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const onNav = useSectionNav();
  return <Dashboard onNav={onNav} />;
}
