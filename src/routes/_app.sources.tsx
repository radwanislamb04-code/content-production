import { createFileRoute } from "@tanstack/react-router";
import { Sources } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/sources")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Sources" },
      { name: "description", content: "Connected content data sources, coming soon." },
      { property: "og:title", content: "JepyLabs — Sources" },
      { property: "og:description", content: "Connected content data sources, coming soon." },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  return <Sources />;
}
