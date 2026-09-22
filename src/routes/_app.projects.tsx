import { createFileRoute } from "@tanstack/react-router";
import { Projects } from "@/components/aios/sections/Projects";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({
    meta: [
      { title: "Content OS — Projects" },
      { name: "description", content: "Track every content project from idea to published post." },
      { property: "og:title", content: "Content OS — Projects" },
      { property: "og:description", content: "Track every content project from idea to published post." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  return <Projects />;
}
