import { createFileRoute } from "@tanstack/react-router";
import { Characters } from "@/components/aios/sections/Characters";

export const Route = createFileRoute("/_app/characters")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Characters" },
      { name: "description", content: "Recurring on-screen characters and personas for your content." },
      { property: "og:title", content: "JepyLabs — Characters" },
      { property: "og:description", content: "Recurring on-screen characters and personas for your content." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  return <Characters />;
}
