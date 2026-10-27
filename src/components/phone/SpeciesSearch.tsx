import * as React from "react";
import { Search, X } from "lucide-react";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { TypePill } from "@/components/battle/BattleBits";
import { cn } from "@/lib/utils";
import { useSpecies } from "@/hooks/useBag";
import { searchSpecies } from "@/lib/pokemonSearch";
import { useDebounced } from "@/hooks/useDebounced";
import type { Species } from "@/types/database.types";

/**
 * Search-as-you-type Pokémon picker (instead of a 1,025-entry dropdown).
 * `tone` matches the surrounding UI: the admin panel or the phone.
 */
export function SpeciesSearch({
  value,
  onChange,
  placeholder = "Search Pokémon…",
  tone = "admin",
  allowClear = false,
  clearLabel = "None",
  autoFocus,
}: {
  value: number | null;
  onChange: (speciesId: number | null, species: Species | null) => void;
  placeholder?: string;
  tone?: "admin" | "phone";
  allowClear?: boolean;
  clearLabel?: string;
  autoFocus?: boolean;
}) {
  const { data: species = [] } = useSpecies();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const debounced = useDebounced(query, 150);
  const results = React.useMemo(() => searchSpecies(species, debounced), [species, debounced]);
  const selected = value != null ? species.find((s) => s.id === value) ?? null : null;
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const admin = tone === "admin";

  return (
    <div ref={boxRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-2.5",
          admin ? "border-white/10 bg-white/5" : "border-white/15 bg-white/5"
        )}
      >
        {selected && !open ? (
          <PokemonSprite speciesId={selected.id} view="icon" alt={selected.name} className="h-7 w-7 shrink-0" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <input
          className={cn(
            "min-w-0 flex-1 bg-transparent py-2 text-sm focus:outline-none",
            admin ? "text-slate-100 placeholder:text-slate-500" : "text-mist placeholder:text-mist/40"
          )}
          placeholder={selected && !open ? `#${String(selected.id).padStart(3, "0")} ${selected.name}` : placeholder}
          value={open ? query : ""}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              onChange(results[0].id, results[0]);
              setQuery("");
              setOpen(false);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          aria-label="Search Pokémon by name or Pokédex number"
        />
        {allowClear && selected ? (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className={admin ? "text-slate-500 hover:text-slate-300" : "text-mist/40"}
            aria-label={`Clear (${clearLabel})`}
            title={clearLabel}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open && query.trim() ? (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border shadow-glass",
            admin ? "border-white/10 bg-[#141a2a]" : "border-white/10 bg-screen-deep"
          )}
        >
          {results.length === 0 ? (
            <p className={cn("px-3 py-3 text-xs", admin ? "text-slate-500" : "text-mist/50")}>
              {debounced === query ? "No Pokémon found." : "Searching…"}
            </p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.id, s);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left",
                  admin ? "hover:bg-white/5" : "active:bg-white/10",
                  s.id === value && "bg-volt/10"
                )}
              >
                <PokemonSprite speciesId={s.id} view="icon" alt={s.name} className="h-8 w-8 shrink-0" />
                <span className={cn("w-12 shrink-0 font-mono text-[11px]", admin ? "text-slate-500" : "text-mist/50")}>
                  #{String(s.id).padStart(3, "0")}
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-sm", admin ? "text-slate-100" : "text-mist")}>{s.name}</span>
                <span className="flex shrink-0 gap-1">
                  <TypePill type={s.type1} />
                  <TypePill type={s.type2} />
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
