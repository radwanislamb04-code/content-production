import { createFileRoute } from "@tanstack/react-router";
import { ContentScore } from "@/components/aios/sections/ContentScore";

export const Route = createFileRoute("/_app/content-score")({
  head: () => ({
    meta: [
      { title: "Content OS — Content Score" },
      { name: "description", content: "Score your hook, retention and script quality before you post." },
      { property: "og:title", content: "Content OS — Content Score" },
      { property: "og:description", content: "Score your hook, retention and script quality before you post." },
    ],
  }),
  component: ContentScorePage,
});

function ContentScorePage() {
  return <ContentScore />;
}
