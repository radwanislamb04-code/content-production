import { createFileRoute } from "@tanstack/react-router";
import { Series } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/series")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Series" },
      { name: "description", content: "Group your content into recurring series, coming soon." },
      { property: "og:title", content: "JepyLabs — Series" },
      { property: "og:description", content: "Group your content into recurring series, coming soon." },
    ],
  }),
  component: SeriesPage,
});

function SeriesPage() {
  return <Series />;
}
