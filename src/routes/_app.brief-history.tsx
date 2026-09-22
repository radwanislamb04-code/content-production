import { createFileRoute } from "@tanstack/react-router";
import { BriefHistoryScreen } from "@/components/aios/sections/BriefHistoryScreen";

export const Route = createFileRoute("/_app/brief-history")({
  head: () => ({
    meta: [
      { title: "Content OS — Brief History" },
      { name: "description", content: "Archive of past daily content briefs." },
      { property: "og:title", content: "Content OS — Brief History" },
      { property: "og:description", content: "Archive of past daily content briefs." },
    ],
  }),
  component: BriefHistoryPage,
});

function BriefHistoryPage() {
  return <BriefHistoryScreen />;
}
