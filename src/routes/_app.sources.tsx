import { createFileRoute } from "@tanstack/react-router";
import { Sources } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/sources")({
  head: () => ({
    meta: [
      { title: "Sources — Jepy Labs" },
      { name: "description", content: "Connected content data sources, coming soon." },
      { property: "og:title", content: "Sources — Jepy Labs" },
      { property: "og:description", content: "Connected content data sources, coming soon." },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  return <Sources />;
}
