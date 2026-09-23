import { adminInput, adminLabel } from "@/components/admin/adminStyles";
import { useAllProfiles } from "@/hooks/useAdmin";
import { useCities } from "@/hooks/useProfile";
import type { RecipientSelection } from "@/hooks/useAdmin";
import type { RewardRecipientMode } from "@/types/database.types";

const MODES: { value: RewardRecipientMode; label: string }[] = [
  { value: "user", label: "One trainer" },
  { value: "users", label: "Multiple trainers" },
  { value: "all", label: "All trainers" },
  { value: "city", label: "A specific city" },
];

export function RecipientPicker({
  value,
  onChange,
}: {
  value: RecipientSelection;
  onChange: (next: RecipientSelection) => void;
}) {
  const { data: profiles } = useAllProfiles();
  const { data: cities } = useCities();

  return (
    <div className="space-y-2">
      <label className={adminLabel}>Recipients</label>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange({ mode: m.value })}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium " +
              (value.mode === m.value ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === "user" ? (
        <select
          className={adminInput}
          value={value.profileId ?? ""}
          onChange={(e) => onChange({ ...value, profileId: e.target.value })}
        >
          <option value="">Choose a trainer…</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.username} (#{p.trainer_id})
            </option>
          ))}
        </select>
      ) : null}

      {value.mode === "users" ? (
        <select
          multiple
          className={`${adminInput} h-32`}
          value={value.profileIds ?? []}
          onChange={(e) => onChange({ ...value, profileIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
        >
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.username} (#{p.trainer_id})
            </option>
          ))}
        </select>
      ) : null}

      {value.mode === "city" ? (
        <select className={adminInput} value={value.cityId ?? ""} onChange={(e) => onChange({ ...value, cityId: e.target.value })}>
          <option value="">Choose a city…</option>
          {cities?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.badge_emoji} {c.name}
            </option>
          ))}
        </select>
      ) : null}

      {value.mode === "all" ? <p className="text-xs text-slate-500">Every trainer account will receive this reward.</p> : null}
    </div>
  );
}
