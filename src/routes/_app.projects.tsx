import { createFileRoute } from "@tanstack/react-router";
import { Projects } from "@/components/aios/sections/Projects";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Projects" },
      { name: "description", content: "Track every content project from idea to published post." },
      { property: "og:title", content: "JepyLabs — Projects" },
      { property: "og:description", content: "Track every content project from idea to published post." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  return <Projects />;
}
