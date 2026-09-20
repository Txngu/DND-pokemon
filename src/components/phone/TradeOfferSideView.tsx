import { Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { ItemIcon } from "@/components/phone/ItemIcon";
import { pokemonSpriteUrl } from "@/lib/sprites";
import type { TradeOfferSide } from "@/types/database.types";

export function TradeOfferSideView({ side, isYou }: { side: TradeOfferSide; isYou: boolean }) {
  const isEmpty = side.pokemon.length === 0 && side.items.length === 0 && side.money === 0;

  return (
    <div className="glass rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {side.profile.avatar ? <AvatarImage src={side.profile.avatar} alt={side.profile.username} /> : null}
            <AvatarFallback className="text-[10px]">{side.profile.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <p className="text-xs font-medium text-mist">{isYou ? "You" : side.profile.username}</p>
        </div>
        {side.confirmed ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <Check className="h-3 w-3" />
            Confirmed
          </span>
        ) : (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-mist/40">Not confirmed</span>
        )}
      </div>

      {isEmpty ? (
        <p className="py-3 text-center text-[11px] text-mist/40">Nothing offered yet</p>
      ) : (
        <div className="space-y-1.5">
          {side.pokemon.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
              <SpriteImage src={pokemonSpriteUrl(p.species_id)} alt={p.species.name} className="h-6 w-6" fallbackClassName="h-6 w-6" />
              <span className="truncate text-xs text-mist">{p.nickname || p.species.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-mist/40">Lv{p.level}</span>
            </div>
          ))}
          {side.items.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
              <ItemIcon item={entry.item} className="h-5 w-5" />
              <span className="truncate text-xs text-mist">{entry.item.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-volt">×{entry.quantity}</span>
            </div>
          ))}
          {side.money > 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
              <span className="text-xs text-mist">Money</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-volt">₽{side.money.toLocaleString()}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
