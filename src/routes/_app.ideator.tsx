import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { Discover } from "@/components/aios/sections/Discover";

export const Route = createFileRoute("/_app/ideator")({
  head: () => ({
    meta: [
      { title: "Ideator — JepyLabs" },
      { name: "description", content: "Generate content ideas from competitors, trends and your own posts." },
      { property: "og:title", content: "Ideator — JepyLabs" },
      { property: "og:description", content: "Generate content ideas from competitors, trends and your own posts." },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const onNav = useSectionNav();
  return <Discover onNav={onNav} />;
}
