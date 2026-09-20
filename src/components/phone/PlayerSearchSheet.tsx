import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useProfile";
import { useTrainerSearch, useSendTradeRequest } from "@/hooks/useTrade";
import { toast } from "@/lib/toast";
import type { TrainerDirectoryEntry } from "@/types/database.types";

interface PlayerSearchSheetProps {
  open: boolean;
  onClose: () => void;
  onRequested: (tradeId: string) => void;
}

export function PlayerSearchSheet({ open, onClose, onRequested }: PlayerSearchSheetProps) {
  const { data: profile } = useProfile();
  const [query, setQuery] = React.useState("");
  const { data: results, isLoading } = useTrainerSearch(query, profile?.id);
  const sendRequest = useSendTradeRequest();

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            className="glass relative z-10 max-h-[75%] rounded-t-3xl p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-mist">Find a trainer</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Username or Trainer ID"
                className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-mist placeholder:text-mist/40 focus:outline-none focus:ring-1 focus:ring-volt"
              />
            </div>

            {sendRequest.isError ? (
              <p className="mb-2 text-xs text-rotom-red-light">{(sendRequest.error as Error).message}</p>
            ) : null}

            <div className="max-h-72 space-y-2 overflow-y-auto pb-2">
              {query.trim().length < 2 ? (
                <p className="py-8 text-center text-xs text-mist/40">Type at least 2 characters to search.</p>
              ) : isLoading ? (
                <p className="py-8 text-center text-xs text-mist/40">Searching…</p>
              ) : !results || results.length === 0 ? (
                <p className="py-8 text-center text-xs text-mist/40">No trainer found.</p>
              ) : (
                results.map((r: TrainerDirectoryEntry) => (
                  <div key={r.profile_id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                    <Avatar className="h-9 w-9">
                      {r.avatar ? <AvatarImage src={r.avatar} alt={r.username} /> : null}
                      <AvatarFallback>{r.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-mist">{r.username}</p>
                      <p className="font-mono text-[10px] text-mist/40">#{r.trainer_id}</p>
                    </div>
                    <button
                      type="button"
                      disabled={sendRequest.isPending}
                      onClick={() =>
                        sendRequest.mutate(r.profile_id, {
                          onSuccess: (tradeId) => {
                            toast(`Trade request sent to ${r.username}`, "success");
                            onRequested(tradeId);
                          },
                        })
                      }
                      className="flex shrink-0 touch-manipulation items-center gap-1 rounded-full bg-volt px-3 py-1.5 text-xs font-semibold text-screen-ink active:scale-95 disabled:opacity-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Trade
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
