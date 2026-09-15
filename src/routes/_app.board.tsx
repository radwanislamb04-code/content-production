import { createFileRoute } from "@tanstack/react-router";
import { BoardScreen } from "@/components/aios/sections/Board";

export const Route = createFileRoute("/_app/board")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Board" },
      { name: "description", content: "A kanban board for planning content." },
      { property: "og:title", content: "JepyLabs — Board" },
      { property: "og:description", content: "A kanban board for planning content." },
    ],
  }),
  component: BoardPage,
});

function BoardPage() {
  return <BoardScreen />;
}
