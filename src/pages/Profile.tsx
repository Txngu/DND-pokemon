import { Wallet, Fingerprint, Sparkles, IdCard, BookOpen, CalendarDays } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { RegionalEmblem } from "@/components/theme/Emblems";
import { useRegionalTheme } from "@/hooks/useRegionalTheme";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useCities } from "@/hooks/useProfile";
import { useTrainerPokemon } from "@/hooks/useBag";

export default function Profile() {
  const { profile } = usePhoneContext();
  const theme = useRegionalTheme();
  const { data: cities } = useCities();
  const { data: pokemon, isLoading: pokemonLoading } = useTrainerPokemon();
  const city = cities?.find((c) => c.id === profile.city_id);
  const initials = profile.username.slice(0, 2).toUpperCase();
  const dexCount = new Set((pokemon ?? []).map((p) => p.species_id)).size;
  const memberSince = new Date(profile.created_at).toLocaleDateString([], { month: "long", year: "numeric" });

  const stats = [
    { icon: Wallet, label: "Money", value: `₽${profile.money.toLocaleString()}` },
    { icon: Fingerprint, label: "Trainer ID", value: `#${profile.trainer_id}` },
    { icon: Sparkles, label: "Favorite Pokémon", value: profile.favorite_pokemon ?? "Not set" },
    { icon: BookOpen, label: "Pokédex", value: pokemonLoading ? "…" : `${dexCount} species caught` },
    { icon: CalendarDays, label: "Trainer since", value: memberSince },
  ];

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Trainer Card" icon={<IdCard className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {/* Trainer Card portrait block */}
        <div
          className="glass-premium relative overflow-hidden rounded-3xl p-6"
          style={{ borderColor: `${theme.colors.primary}55` }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: theme.emblemGlow }} />

          {/* Corner emblems */}
          <RegionalEmblem
            themeKey={theme.key}
            className="absolute -left-2 -top-2 h-10 w-10 opacity-20"
            style={{ color: theme.colors.secondary }}
          />
          <RegionalEmblem
            themeKey={theme.key}
            className="absolute -bottom-2 -right-2 h-10 w-10 rotate-180 opacity-20"
            style={{ color: theme.colors.secondary }}
          />

          <div className="relative flex flex-col items-center gap-3">
            <Avatar className="h-24 w-24 theme-glow-ring">
              {profile.avatar ? <AvatarImage src={profile.avatar} alt={profile.username} /> : null}
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="font-display text-2xl font-semibold text-mist">{profile.username}</p>
              <p className="font-mono text-xs text-mist/50">{profile.email}</p>
            </div>

            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-mist"
              style={{ backgroundColor: `${theme.colors.primary}22`, border: `1px solid ${theme.colors.primary}66` }}
            >
              <RegionalEmblem themeKey={theme.key} className="h-3.5 w-3.5" style={{ color: theme.colors.secondary }} />
              <span>{city?.name ?? "No city set"}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="glass theme-accent-line flex items-center gap-3 rounded-2xl p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-mist/50">{label}</p>
                {pokemonLoading && label === "Pokédex" ? (
                  <Skeleton className="mt-1 h-4 w-24" />
                ) : (
                  <p className="font-display text-sm font-medium text-mist">{value}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
