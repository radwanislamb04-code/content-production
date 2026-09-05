import { createFileRoute } from "@tanstack/react-router";
import { Resources } from "@/components/aios/sections/Resources";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({
    meta: [
      { title: "Resources — JepyLabs" },
      { name: "description", content: "Your bookmarked creator tools, previewable in one place." },
      { property: "og:title", content: "Resources — JepyLabs" },
      { property: "og:description", content: "Your bookmarked creator tools, previewable in one place." },
    ],
  }),
  component: ResourcesPage,
});

function ResourcesPage() {
  return <Resources />;
}
