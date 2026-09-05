import { createFileRoute } from "@tanstack/react-router";
import { Sources } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/sources")({
  head: () => ({
    meta: [
      { title: "Sources — JepyLabs" },
      { name: "description", content: "Connected content data sources, coming soon." },
      { property: "og:title", content: "Sources — JepyLabs" },
      { property: "og:description", content: "Connected content data sources, coming soon." },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  return <Sources />;
}
