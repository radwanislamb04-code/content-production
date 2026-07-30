import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ title: z.string().min(1).max(200) });

export const Route = createFileRoute("/api/library/$type/$id")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return new Response("Invalid body", { status: 400 });
        }
        return Response.json({ ok: true, title: parsed.data.title });
      },
    },
  },
});
