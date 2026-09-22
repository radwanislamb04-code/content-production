import { createFileRoute } from "@tanstack/react-router";
import { SeriesScreen } from "@/components/aios/sections/SeriesScreen";

export const Route = createFileRoute("/_app/series")({
  head: () => ({
    meta: [
      { title: "Content OS — Series" },
      { name: "description", content: "Group recurring content — not built yet, and what it needs." },
      { property: "og:title", content: "Content OS — Series" },
      { property: "og:description", content: "Group recurring content — not built yet, and what it needs." },
    ],
  }),
  component: SeriesPage,
});

function SeriesPage() {
  return <SeriesScreen />;
}
