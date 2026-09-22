import { createFileRoute } from "@tanstack/react-router";
import { ThumbnailStudio } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/thumbnail-studio")({
  head: () => ({
    meta: [
      { title: "Content OS — Thumbnail Studio" },
      { name: "description", content: "Thumbnail generation and testing, coming soon." },
      { property: "og:title", content: "Content OS — Thumbnail Studio" },
      { property: "og:description", content: "Thumbnail generation and testing, coming soon." },
    ],
  }),
  component: ThumbnailStudioPage,
});

function ThumbnailStudioPage() {
  return <ThumbnailStudio />;
}
