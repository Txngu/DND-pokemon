import { TcgCardImage } from "@/components/tcg/TcgBits";
import { cardNumber } from "@/lib/tcgdex";
import { useTcgCollection, useTcgLinks } from "@/hooks/useTcg";

/** Game Master: a trainer's virtual TCG collection, view-only. */
export function AdminTcgCollection({ profileId }: { profileId: string }) {
  const { data: cards = [], isLoading } = useTcgCollection(profileId);
  const { data: links = [] } = useTcgLinks(profileId);
  const total = cards.reduce((n, c) => n + c.quantity, 0);

  return (
    <section className="mt-6 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        TCG cards ({total}) <span className="normal-case text-slate-500">· view only</span>
      </h3>
      {isLoading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-500">No virtual cards yet.</p>
      ) : (
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2 sm:grid-cols-6">
          {cards.map((c) => {
            const linked = links.filter((l) => l.collection_id === c.id).length;
            return (
              <div key={c.id} className="min-w-0" title={`${c.name} — ${c.set_name ?? ""} ${cardNumber(c.local_id, c.set_total)}`}>
                <TcgCardImage image={c.image_url} name={c.name} />
                <p className="mt-0.5 truncate text-[10px] text-slate-200">{c.name}</p>
                <p className="truncate text-[9px] text-slate-500">
                  ×{c.quantity}
                  {linked ? ` · ${linked} linked` : ""}
                  {c.lang !== "en" ? ` · ${c.lang.toUpperCase()}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
