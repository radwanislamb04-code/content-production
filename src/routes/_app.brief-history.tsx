import { createFileRoute } from "@tanstack/react-router";
import { BriefHistory } from "@/components/aios/sections/Placeholders";

export const Route = createFileRoute("/_app/brief-history")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Brief History" },
      { name: "description", content: "Archive of past daily content briefs." },
      { property: "og:title", content: "JepyLabs — Brief History" },
      { property: "og:description", content: "Archive of past daily content briefs." },
    ],
  }),
  component: BriefHistoryPage,
});

function BriefHistoryPage() {
  return <BriefHistory />;
}
