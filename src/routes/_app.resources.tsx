import { createFileRoute } from "@tanstack/react-router";
import { Resources } from "@/components/aios/sections/Resources";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Resources" },
      { name: "description", content: "Your bookmarked creator tools, previewable in one place." },
      { property: "og:title", content: "JepyLabs — Resources" },
      { property: "og:description", content: "Your bookmarked creator tools, previewable in one place." },
    ],
  }),
  component: ResourcesPage,
});

function ResourcesPage() {
  return <Resources />;
}
