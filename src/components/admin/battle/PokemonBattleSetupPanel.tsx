import * as React from "react";
import { Swords, X } from "lucide-react";
import { adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { TypePill } from "@/components/battle/BattleBits";
import { toast } from "@/lib/toast";
import { pokemonStat, typeLabel } from "@/lib/battle";
import { useAdminSetPokemonBattleSetup, useMoves, usePokemonBattleProfile } from "@/hooks/useEncounter";
import type { Move, PokemonBattleProfile, TrainerPokemon } from "@/types/database.types";

const STAT_KEYS: { key: keyof PokemonBattleProfile["bonus"]; label: string }[] = [
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "sp_attack", label: "Sp. Atk" },
  { key: "sp_defense", label: "Sp. Def" },
  { key: "speed", label: "Speed" },
];

/** Grouped <option>s of every move, by type. */
export function MoveOptions({ moves }: { moves: Move[] | undefined }) {
  const byType = React.useMemo(() => {
    const map = new Map<string, Move[]>();
    for (const m of moves ?? []) {
      const list = map.get(m.type) ?? [];
      list.push(m);
      map.set(m.type, list);
    }
    return [...map.entries()];
  }, [moves]);
  return (
    <>
      {byType.map(([type, list]) => (
        <optgroup key={type} label={typeLabel(type as Move["type"])}>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.power}
              {m.accuracy ? `, ${m.accuracy}%` : ""})
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/**
 * Game Master editor for one trainer Pokémon's battle setup: up to 4 moves
 * (or "automatic" — the default set for its types and level) and per-stat
 * bonuses added on top of the level-based stats.
 */
export function PokemonBattleSetupPanel({ pokemon, onClose }: { pokemon: TrainerPokemon; onClose: () => void }) {
  const { data: profile } = usePokemonBattleProfile(pokemon.id);
  const { data: moves } = useMoves();
  const save = useAdminSetPokemonBattleSetup();

  const [moveIds, setMoveIds] = React.useState<string[]>(["", "", "", ""]);
  const [bonus, setBonus] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!profile) return;
    const ids = profile.custom_moves ? profile.moves.map((m) => String(m.id)) : [];
    setMoveIds([0, 1, 2, 3].map((i) => ids[i] ?? ""));
    setBonus(Object.fromEntries(STAT_KEYS.map(({ key }) => [key, String(profile.bonus[key])])));
  }, [profile]);

  const name = pokemon.nickname || pokemon.species.name;

  function submit(resetMoves: boolean) {
    const ids = resetMoves ? null : moveIds.filter(Boolean).map(Number);
    const parsedBonus = Object.fromEntries(
      STAT_KEYS.map(({ key }) => [key, Math.round(Number(bonus[key])) || 0])
    ) as PokemonBattleProfile["bonus"];
    save.mutate(
      { pokemonId: pokemon.id, moveIds: ids && ids.length ? ids : null, bonus: parsedBonus },
      { onSuccess: () => toast(`${name}'s battle setup saved`, "success") }
    );
  }

  return (
    <div className="rounded-lg border border-volt/30 bg-volt/[0.04] p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          <Swords className="h-4 w-4 text-volt" />
          Battle setup · {name} (Lv{pokemon.level})
          {profile ? (
            <span className="ml-1 flex gap-1">
              <TypePill type={profile.type1} />
              <TypePill type={profile.type2} />
            </span>
          ) : null}
        </p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!profile ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        <>
          <label className={adminLabel}>Moves {profile.custom_moves ? "" : "(currently automatic)"}</label>
          <div className="grid grid-cols-2 gap-2">
            {moveIds.map((id, i) => (
              <select
                key={i}
                className={adminInput}
                value={id}
                onChange={(e) => setMoveIds((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))}
              >
                <option value="">{profile.custom_moves ? "— none —" : `Auto: ${profile.moves[i]?.name ?? "—"}`}</option>
                <MoveOptions moves={moves} />
              </select>
            ))}
          </div>

          <label className={`${adminLabel} mt-3`}>Stat bonuses (added to 40 + 6 × level)</label>
          <div className="grid grid-cols-5 gap-2">
            {STAT_KEYS.map(({ key, label }) => (
              <div key={key}>
                <p className="mb-0.5 text-[10px] text-slate-500">{label}</p>
                <input
                  className={adminInput}
                  inputMode="numeric"
                  value={bonus[key] ?? "0"}
                  onChange={(e) => setBonus((b) => ({ ...b, [key]: e.target.value.replace(/[^\d-]/g, "") }))}
                />
                <p className="mt-0.5 text-[10px] text-slate-500">= {pokemonStat(pokemon.level, Math.round(Number(bonus[key])) || 0)}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={adminButtonPrimary} disabled={save.isPending} onClick={() => submit(false)}>
              Save
            </button>
            <button type="button" className={adminButtonSecondary} disabled={save.isPending} onClick={() => submit(true)}>
              Use automatic moves
            </button>
          </div>
        </>
      )}
    </div>
  );
}
