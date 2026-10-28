import * as React from "react";
import { Trash2, ShieldAlert, Skull, Heart, Plus } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { adminInput, adminLabel, adminButtonPrimary, adminButtonSecondary, adminButtonDanger } from "@/components/admin/adminStyles";
import { WALLPAPER_OPTIONS } from "@/lib/cityThemes";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { ItemIcon } from "@/components/phone/ItemIcon";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { toast } from "@/lib/toast";
import { useCities } from "@/hooks/useProfile";
import { CreatePokemonForm } from "@/components/phone/CreatePokemonForm";
import { AdminPokemonHpPanel } from "@/components/admin/AdminPokemonHpPanel";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { useRealtimeInvalidate } from "@/hooks/useEncounter";
import {
  useAdminUpdateProfile,
  useQuickGrant,
  useProfilePokemon,
  useProfileItems,
  useAdminRemovePokemon,
  useAdminRemoveItemQuantity,
  useAdminDeleteUser,
  useAdminResetPassword,
  useAllItemsCatalog,
  useAllProfiles,
} from "@/hooks/useAdmin";
import { useAdminSetPokemonDead } from "@/hooks/useBattle";
import { AdminTcgCollection } from "@/components/admin/AdminTcgCollection";
import type { Profile, TrainerPokemon } from "@/types/database.types";

export function ManageUserModal({
  profile,
  adminId,
  onClose,
}: {
  profile: Profile;
  adminId: string;
  onClose: () => void;
}) {
  const { data: cities } = useCities();
  const { data: catalog } = useAllItemsCatalog();
  const { data: pokemon } = useProfilePokemon(profile.id);
  const { data: items } = useProfileItems(profile.id);

  const updateProfile = useAdminUpdateProfile();
  const quickGrant = useQuickGrant();
  const removePokemon = useAdminRemovePokemon();
  const removeItemQty = useAdminRemoveItemQuantity();
  const deleteUser = useAdminDeleteUser();
  const resetPassword = useAdminResetPassword();

  const [username, setUsername] = React.useState(profile.username);
  const [cityId, setCityId] = React.useState(profile.city_id ?? "");
  const [wallpaper, setWallpaper] = React.useState(profile.wallpaper ?? "");
  const [avatar, setAvatar] = React.useState(profile.avatar ?? "");
  const [moneyAmount, setMoneyAmount] = React.useState("100");
  const [giveItemId, setGiveItemId] = React.useState("");
  const [giveItemQty, setGiveItemQty] = React.useState("1");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [hpTargetId, setHpTargetId] = React.useState<string | null>(null);
  const { data: allProfiles } = useAllProfiles();
  // KP changes the trainer makes (or battles) show up here live.
  useRealtimeInvalidate(
    `admin-user-pokemon-${profile.id}`,
    [{ table: "trainer_pokemon", filter: `profile_id=eq.${profile.id}` }],
    [["admin", "profile_pokemon", profile.id], ["pokemon_hp_events"]]
  );
  const [deadTarget, setDeadTarget] = React.useState<TrainerPokemon | null>(null);
  const setDead = useAdminSetPokemonDead();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");

  function saveProfileFields() {
    updateProfile.mutate(
      {
        profileId: profile.id,
        patch: {
          username: username.trim() || profile.username,
          city_id: cityId || null,
          wallpaper: wallpaper || null,
          avatar: avatar || null,
        },
      },
      { onSuccess: () => toast("Trainer profile updated", "success") }
    );
  }

  function giveMoney(sign: 1 | -1) {
    const amount = Math.max(0, Math.round(Number(moneyAmount)) || 0);
    if (amount <= 0) return;
    if (sign === 1) {
      quickGrant.mutate(
        { kind: "money", message: "", payload: { amount }, profileId: profile.id, adminId },
        { onSuccess: () => toast(`Gave ₽${amount} to ${profile.username}`, "success") }
      );
    } else {
      updateProfile.mutate(
        { profileId: profile.id, patch: { money: Math.max(0, profile.money - amount) } },
        { onSuccess: () => toast(`Removed ₽${amount} from ${profile.username}`, "success") }
      );
    }
  }

  function giveItem() {
    if (!giveItemId) return;
    const qty = Math.max(1, Math.round(Number(giveItemQty)) || 1);
    quickGrant.mutate(
      { kind: "items", message: "", payload: { items: [{ item_id: giveItemId, quantity: qty }] }, profileId: profile.id, adminId },
      { onSuccess: () => toast("Item granted", "success") }
    );
  }

  return (
    <AdminModal open title={`Manage ${profile.username}`} onClose={onClose} width="max-w-3xl">
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Profile fields */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Profile</h3>
          <div>
            <label className={adminLabel}>Username</label>
            <input className={adminInput} value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className={adminLabel}>City</label>
            <select className={adminInput} value={cityId} onChange={(e) => setCityId(e.target.value)}>
              <option value="">No city</option>
              {cities?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.badge_emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabel}>Wallpaper</label>
            <select className={adminInput} value={wallpaper} onChange={(e) => setWallpaper(e.target.value)}>
              <option value="">Follow city default</option>
              {WALLPAPER_OPTIONS.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabel}>Avatar image URL</label>
            <input className={adminInput} value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
          </div>
          <button type="button" className={adminButtonPrimary} onClick={saveProfileFields} disabled={updateProfile.isPending}>
            Save profile
          </button>

          <div className="pt-2 text-[11px] text-slate-500">
            Trainer ID #{profile.trainer_id} · {profile.email} · {profile.role}
          </div>
        </section>

        {/* Money */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Money</h3>
          <p className="text-lg font-mono text-volt">₽{profile.money.toLocaleString()}</p>
          <div className="flex items-center gap-2">
            <input
              className={adminInput}
              inputMode="numeric"
              value={moneyAmount}
              onChange={(e) => setMoneyAmount(e.target.value)}
            />
            <button type="button" className={adminButtonPrimary} onClick={() => giveMoney(1)} disabled={quickGrant.isPending}>
              Give
            </button>
            <button type="button" className={adminButtonSecondary} onClick={() => giveMoney(-1)} disabled={updateProfile.isPending}>
              Remove
            </button>
          </div>

          <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Give item</h3>
          <div className="flex items-center gap-2">
            <select className={adminInput} value={giveItemId} onChange={(e) => setGiveItemId(e.target.value)}>
              <option value="">Choose item…</option>
              {catalog?.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            <input
              className={`${adminInput} w-20`}
              inputMode="numeric"
              value={giveItemQty}
              onChange={(e) => setGiveItemQty(e.target.value)}
            />
            <button type="button" className={adminButtonPrimary} onClick={giveItem} disabled={!giveItemId || quickGrant.isPending}>
              Give
            </button>
          </div>
        </section>
      </div>

      {/* Pokémon */}
      <section className="mt-6 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pokémon ({pokemon?.length ?? 0})</h3>
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {pokemon && pokemon.length > 0 ? (
            pokemon.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
                <SpriteImage src={pokemonSpriteUrl(p.species_id)} alt={p.species.name} className="h-6 w-6" fallbackClassName="h-6 w-6" />
                <span className="min-w-0 flex-1 text-xs text-slate-200">
                  {p.nickname || p.species.name} · Lv{p.level}
                  {p.is_shiny ? " ✨" : ""}
                  <span className="ml-1.5 font-mono text-[11px] text-slate-400">
                    {p.current_hp}/{p.max_hp} KP
                  </span>
                  <span className="ml-1.5 text-[10px] text-slate-500">{p.party_slot != null ? "Team" : "PC"}</span>
                  {p.is_dead ? <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">Dead</span> : null}
                </span>
                {!p.is_dead && p.status !== "healthy" ? <StatusBadge status={p.status} className="shrink-0" /> : null}
                <button
                  type="button"
                  title="KP: damage / set"
                  onClick={() => setHpTargetId(hpTargetId === p.id ? null : p.id)}
                  className={hpTargetId === p.id ? "text-volt" : "text-slate-500 hover:text-volt"}
                >
                  <Heart className="h-3.5 w-3.5" />
                </button>
                {!p.is_dead ? (
                  <button type="button" title="Mark as dead (permanent)" onClick={() => setDeadTarget(p)} className="text-slate-500 hover:text-rotom-red-light">
                    <Skull className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  title="Remove Pokémon"
                  onClick={() => removePokemon.mutate(p.id, { onSuccess: () => toast("Pokémon removed", "success") })}
                  className="text-slate-500 hover:text-rotom-red-light"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-2 py-3 text-xs text-slate-500">No Pokémon yet.</p>
          )}
        </div>
        {(() => {
          const target = pokemon?.find((p) => p.id === hpTargetId);
          return target ? <AdminPokemonHpPanel key={target.id} pokemon={target} onClose={() => setHpTargetId(null)} /> : null;
        })()}
        {profile.role === "trainer" ? (
          createOpen ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="mb-3 text-sm font-semibold text-slate-100">Create Pokémon</p>
              <CreatePokemonForm
                tone="admin"
                profileId={profile.id}
                trainers={allProfiles ?? [profile]}
                teamCountFor={(id) => (id === profile.id ? pokemon?.filter((p) => p.party_slot != null).length : undefined)}
                onCancel={() => setCreateOpen(false)}
              />
            </div>
          ) : (
            <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Pokémon
            </button>
          )
        ) : null}
      </section>

      <AdminTcgCollection profileId={profile.id} />

      {/* Items */}
      <section className="mt-6 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Items ({items?.length ?? 0})</h3>
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {items && items.length > 0 ? (
            items.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
                <ItemIcon item={entry.item} className="h-5 w-5" />
                <span className="flex-1 text-xs text-slate-200">
                  {entry.item.name} × {entry.quantity}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    removeItemQty.mutate(
                      { trainerItemId: entry.id, newQuantity: entry.quantity - 1 },
                      { onSuccess: () => toast("Item quantity reduced", "success") }
                    )
                  }
                  className="text-slate-500 hover:text-rotom-red-light"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-2 py-3 text-xs text-slate-500">No items yet.</p>
          )}
        </div>
      </section>

      {/* Danger zone */}
      <section className="mt-6 rounded-lg border border-rotom-red/30 bg-rotom-red/5 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rotom-red-light">
          <ShieldAlert className="h-3.5 w-3.5" />
          Danger zone
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${adminInput} w-48`}
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            type="button"
            className={adminButtonSecondary}
            disabled={newPassword.length < 6 || resetPassword.isPending}
            onClick={() =>
              resetPassword.mutate(
                { auth_id: profile.auth_id, new_password: newPassword, username: profile.username },
                {
                  onSuccess: () => {
                    setNewPassword("");
                    toast("Password reset", "success");
                  },
                }
              )
            }
          >
            Reset password
          </button>
          <button type="button" className={adminButtonDanger} onClick={() => setDeleteConfirmOpen(true)}>
            Delete user
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={!!deadTarget}
        title={`Mark ${deadTarget?.nickname || deadTarget?.species.name} as dead?`}
        message="This is permanent. A dead Pokémon can't be healed, revived, leveled, evolved, or enter battles — and not even the Game Master can undo it from the app."
        confirmLabel="Mark as dead"
        destructive
        onCancel={() => setDeadTarget(null)}
        onConfirm={() => {
          if (!deadTarget) return;
          const name = deadTarget.nickname || deadTarget.species.name;
          setDead.mutate({ pokemonId: deadTarget.id }, { onSuccess: () => toast(`${name} has died`, "success") });
          setDeadTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`Delete ${profile.username}?`}
        message="This permanently deletes their account, Pokémon, items, and trade history. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          deleteUser.mutate(
            { auth_id: profile.auth_id, username: profile.username },
            {
              onSuccess: () => {
                toast(`${profile.username} deleted`, "success");
                setDeleteConfirmOpen(false);
                onClose();
              },
            }
          );
        }}
      />
    </AdminModal>
  );
}
