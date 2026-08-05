import { createFileRoute } from "@tanstack/react-router";

type LibraryRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

type CharacterContent = {
  name: string;
  description: string;
  avatar_url: string;
  in_use: boolean;
};

function parseCharacterContent(raw: string | null): CharacterContent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const r = parsed as Record<string, unknown>;
    return {
      name: typeof r.name === "string" ? r.name : "",
      description: typeof r.description === "string" ? r.description : "",
      avatar_url: typeof r.avatar_url === "string" ? r.avatar_url : "",
      in_use: typeof r.in_use === "boolean" ? r.in_use : false,
    };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/characters")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const db = env?.DB;
        if (!db) {
          return Response.json([]);
        }
        try {
          const { results } = await db
            .prepare(
              "SELECT * FROM library WHERE type = ? ORDER BY created_at DESC",
            )
            .bind("character")
            .all();
          const rows = (results ?? []) as LibraryRow[];
          const characters = rows.map((row) => ({
            ...row,
            content: parseCharacterContent(row.content),
          }));
          return Response.json(characters);
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load characters: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }
      },
      POST: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const db = env?.DB;
        if (!db) {
          return Response.json({ error: "DB not configured" }, { status: 500 });
        }

        let body: {
          name?: unknown;
          description?: unknown;
          avatar_url?: unknown;
          in_use?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const name = typeof body.name === "string" ? body.name : "";
        const description = typeof body.description === "string" ? body.description : "";
        const avatar_url = typeof body.avatar_url === "string" ? body.avatar_url : "";
        const in_use = typeof body.in_use === "boolean" ? body.in_use : false;

        if (!name) {
          return Response.json({ error: 'Missing "name"' }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const content = JSON.stringify({ name, description, avatar_url, in_use });

        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, status, title, content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(id, "character", "active", name, content, now, now)
            .run();
        } catch (err: any) {
          return Response.json(
            { error: `Failed to insert character: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        return Response.json({
          id,
          type: "character",
          status: "active",
          title: name,
          content: { name, description, avatar_url, in_use },
          created_at: now,
          updated_at: now,
        });
      },
    },
  },
});
