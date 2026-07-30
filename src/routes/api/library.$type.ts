import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/library/$type")({
  server: {
    handlers: {
      GET: async () => Response.json([]),
    },
  },
});
