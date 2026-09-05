import { createFileRoute } from "@tanstack/react-router";
import { Series } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/series")({
  head: () => ({
    meta: [
      { title: "Series — Jepy Labs" },
      { name: "description", content: "Group your content into recurring series, coming soon." },
      { property: "og:title", content: "Series — Jepy Labs" },
      { property: "og:description", content: "Group your content into recurring series, coming soon." },
    ],
  }),
  component: SeriesPage,
});

function SeriesPage() {
  return <Series />;
}
