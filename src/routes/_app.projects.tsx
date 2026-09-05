import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { Projects } from "@/components/aios/sections/Projects";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({
    meta: [
      { title: "Projects — Jepy Labs" },
      { name: "description", content: "Track every content project from idea to published post." },
      { property: "og:title", content: "Projects — Jepy Labs" },
      { property: "og:description", content: "Track every content project from idea to published post." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const onNav = useSectionNav();
  return <Projects onNav={onNav} />;
}
