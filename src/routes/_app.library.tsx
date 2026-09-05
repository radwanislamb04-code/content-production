import { createFileRoute } from "@tanstack/react-router";
import { Library } from "@/components/aios/sections/Library";

export const Route = createFileRoute("/_app/library")({
  head: () => ({
    meta: [
      { title: "Library — JepyLabs" },
      { name: "description", content: "Every idea, script, storyboard and prompt you have saved." },
      { property: "og:title", content: "Library — JepyLabs" },
      { property: "og:description", content: "Every idea, script, storyboard and prompt you have saved." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  return <Library />;
}
