import { useEffect, useState } from "react";
import { Input, OutlineBtn, Pill, PrimaryBtn } from "../ui";
import { Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut, errorMessage } from "@/lib/api";
import type { CharacterRow } from "@/lib/content-types";

/**
 * Shrink a chosen photo to what an image model can actually accept.
 *
 * FLUX.2 takes reference images under 512x512, and a Worker cannot resize an image — so the
 * resizing has to happen in the browser, before the picture is stored. It also keeps the row
 * small enough to hold as a data URL, which is why there is no upload route, no second
 * storage bucket, and no public URL that would have to punch through Cloudflare Access for
 * the server to read the reference back.
 */
async function fileToAvatarDataUrl(file: File, max = 512): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize images.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.85);
}

export function Characters() {
  const [chars, setChars] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  /** The row being changed, or null when adding a new character. */
  const [editing, setEditing] = useState<CharacterRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<CharacterRow[]>("/api/characters")
      .then((rows) => {
        if (alive) setChars(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setAvatar("");
    setOpen(false);
  };

  const startEdit = (row: CharacterRow) => {
    setEditing(row);
    setName(row.content?.name ?? row.title ?? "");
    setDescription(row.content?.description ?? "");
    setAvatar(row.content?.avatar_url ?? "");
    setOpen(true);
  };

  /** Attach a photo: read it, shrink it, keep it as the avatar. */
  const attach = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatar(await fileToAvatarDataUrl(file));
      toast.success("Photo attached — it will be sent as the face reference.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const content = JSON.stringify({
      name: name.trim(),
      description: description.trim(),
      avatar_url: avatar.trim(),
      in_use: editing?.content?.in_use ?? false,
    });
    try {
      if (editing) {
        await apiPut(`/api/library/character/${editing.id}`, {
          title: name.trim(),
          content,
        });
        setChars((prev) =>
          prev.map((c) =>
            c.id === editing.id
              ? { ...c, title: name.trim(), content: JSON.parse(content) }
              : c,
          ),
        );
        toast.success("Character updated");
      } else {
        const created = await apiPost<CharacterRow>("/api/characters", {
          name: name.trim(),
          description: description.trim(),
          avatar_url: avatar.trim(),
          in_use: false,
        });
        setChars((prev) => [created, ...prev]);
        toast.success("Character added");
      }
      resetForm();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Mark one character as the one the generator should reach for.
   *
   * `in_use` was already read by the storyboard and the thumbnail studio, but nothing in the
   * app could set it — Enzo was `in_use` because the row was created that way, and a second
   * character could never take over.
   */
  const makeMain = async (row: CharacterRow) => {
    setBusyId(row.id);
    try {
      await Promise.all(
        chars.map((c) =>
          c.id === row.id
            ? apiPut(`/api/library/character/${c.id}`, {
                content: JSON.stringify({ ...(c.content ?? {}), in_use: true }),
              })
            : c.content?.in_use
              ? apiPut(`/api/library/character/${c.id}`, {
                  content: JSON.stringify({ ...(c.content ?? {}), in_use: false }),
                })
              : Promise.resolve(),
        ),
      );
      setChars((prev) =>
        prev.map((c) => ({ ...c, content: { ...(c.content as any), in_use: c.id === row.id } })),
      );

      if (row.id !== editing?.id) toast.success(`${row.content?.name ?? row.title} is now the main character`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-fg">Characters</div>

      {loading ? (
        <div className="text-sm text-mute">Loading characters…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {chars.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-surface p-4">
              {c.content?.avatar_url ? (
                <img
                  src={c.content.avatar_url}
                  alt={c.content?.name || c.title}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-line" />
              )}
              <div className="mt-3 truncate text-sm text-fg">
                {c.content?.name || c.title}
              </div>
              {c.content?.in_use && (
                <div className="mt-1">
                  <Pill variant="accent">Main character</Pill>
                </div>
              )}
              {c.content?.description && (
                <div className="mt-1 line-clamp-2 text-xs text-mute">
                  {c.content.description}
                </div>
              )}
              {!c.content?.avatar_url && (
                <div className="mt-2 text-xs text-mute">
                  No photo — attach one to keep their face the same in generated images.
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <OutlineBtn onClick={() => startEdit(c)}>Edit</OutlineBtn>
                {!c.content?.in_use && (
                  <OutlineBtn onClick={() => makeMain(c)} disabled={busyId === c.id}>
                    <Star size={13} /> Make main
                  </OutlineBtn>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="grid place-items-center rounded-xl border border-dashed border-line2 p-4 text-mute hover:border-lime hover:text-lime"
          >
            <Plus size={16} />
            <span className="mt-1 text-xs">Add New</span>
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="text-sm font-semibold text-fg">
            {editing ? `Edit ${editing.content?.name ?? editing.title}` : "New character"}
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
          />

          <div className="space-y-2 rounded-lg border border-line p-3">
            <div className="text-[11px] uppercase tracking-wide text-mute">
              Face reference
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {avatar ? (
                <img
                  src={avatar}
                  alt="Avatar preview"
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-line" />
              )}
              <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs text-fg2 hover:border-lime hover:text-lime">
                Attach photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => attach(e.target.files?.[0])}
                />
              </label>
              {avatar && (
                <button
                  onClick={() => setAvatar("")}
                  className="inline-flex items-center gap-1 text-xs text-mute hover:text-err"
                >
                  <X size={11} /> Remove
                </button>
              )}
            </div>
            <Input
              value={avatar.startsWith("data:") ? "" : avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="…or paste an image URL"
            />
            <div className="text-xs text-mute">
              Resized to 512px in your browser, which is also what the image model needs for
              a reference. A clear face is what makes the generated face match.
            </div>
          </div>

          <div className="flex gap-2">
            <PrimaryBtn onClick={save} loading={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Save Character"}
            </PrimaryBtn>
            <OutlineBtn onClick={resetForm}>Cancel</OutlineBtn>
          </div>
        </div>
      )}
    </div>
  );
}
