import { createFileRoute } from "@tanstack/react-router";
import { ThumbnailStudio } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/thumbnail-studio")({
  head: () => ({
    meta: [
      { title: "Thumbnail Studio — Jepy Labs" },
      { name: "description", content: "Thumbnail generation and testing, coming soon." },
      { property: "og:title", content: "Thumbnail Studio — Jepy Labs" },
      { property: "og:description", content: "Thumbnail generation and testing, coming soon." },
    ],
  }),
  component: ThumbnailStudioPage,
});

function ThumbnailStudioPage() {
  return <ThumbnailStudio />;
}
