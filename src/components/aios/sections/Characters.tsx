import { useEffect, useState } from "react";
import { Input, OutlineBtn, PrimaryBtn } from "../ui";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { CharacterRow } from "@/lib/content-types";

export function Characters() {
  const [chars, setChars] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);

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

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<CharacterRow>("/api/characters", {
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatar.trim(),
        in_use: false,
      });
      setChars((prev) => [created, ...prev]);
      setName("");
      setDescription("");
      setAvatar("");
      setOpen(false);
      toast.success("Character added");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
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
              {c.content?.description && (
                <div className="mt-1 line-clamp-2 text-xs text-mute">
                  {c.content.description}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid place-items-center rounded-xl border border-dashed border-line2 p-4 text-mute hover:border-lime hover:text-lime"
          >
            <Plus size={16} />
            <span className="mt-1 text-xs">Add New</span>
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
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
          <Input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="Avatar image URL (optional)"
          />
          <div className="flex gap-2">
            <PrimaryBtn onClick={save} loading={saving}>
              {saving ? "Saving…" : "Save Character"}
            </PrimaryBtn>
            <OutlineBtn onClick={() => setOpen(false)}>Cancel</OutlineBtn>
          </div>
        </div>
      )}
    </div>
  );
}
