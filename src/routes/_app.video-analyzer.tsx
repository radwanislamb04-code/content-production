import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { VideoAnalyzer } from "@/components/aios/sections/VideoAnalyzer";

export const Route = createFileRoute("/_app/video-analyzer")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Video Analyzer" },
      { name: "description", content: "Turn any reference video or idea into hooks, scripts and captions." },
      { property: "og:title", content: "JepyLabs — Video Analyzer" },
      { property: "og:description", content: "Turn any reference video or idea into hooks, scripts and captions." },
    ],
  }),
  component: VideoAnalyzerPage,
});

function VideoAnalyzerPage() {
  const onNav = useSectionNav();
  return <VideoAnalyzer onNav={onNav} />;
}
