import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { Storyboard } from "@/components/aios/sections/Storyboard";

export const Route = createFileRoute("/_app/storyboard")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Storyboard" },
      { name: "description", content: "Break your script into shot-by-shot visual direction." },
      { property: "og:title", content: "JepyLabs — Storyboard" },
      { property: "og:description", content: "Break your script into shot-by-shot visual direction." },
    ],
  }),
  component: StoryboardPage,
});

function StoryboardPage() {
  const onNav = useSectionNav();
  return <Storyboard onNav={onNav} />;
}
