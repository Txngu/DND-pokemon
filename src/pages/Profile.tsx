import { Wallet, Fingerprint, Sparkles, User, BookOpen, CalendarDays } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useCities } from "@/hooks/useProfile";
import { useTrainerPokemon } from "@/hooks/useBag";

export default function Profile() {
  const { profile } = usePhoneContext();
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
    {
      icon: BookOpen,
      label: "Pokédex",
      value: pokemonLoading ? "…" : `${dexCount} species caught`,
    },
    { icon: CalendarDays, label: "Trainer since", value: memberSince },
  ];

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Trainer Profile" icon={<User className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center gap-3 pb-6">
          <Avatar className="h-24 w-24 ring-4" style={{ boxShadow: `0 0 0 4px ${city?.accent_color ?? "#FFD23F"}66` }}>
            {profile.avatar ? <AvatarImage src={profile.avatar} alt={profile.username} /> : null}
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="font-display text-xl font-semibold text-mist">{profile.username}</p>
            <p className="font-mono text-xs text-mist/50">{profile.email}</p>
          </div>

          {city ? (
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: `${city.accent_color}33`, border: `1px solid ${city.accent_color}88` }}
            >
              <span>{city.badge_emoji}</span>
              <span>{city.name}</span>
            </div>
          ) : (
            <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-mist/50">No city set</div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {stats.map(({ icon: Icon, label, value }) => (
            <Card key={label} className="border-white/5 bg-white/5">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt/15 text-volt">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-mist/50">{label}</p>
                  {pokemonLoading && label === "Pokédex" ? (
                    <Skeleton className="mt-1 h-4 w-24" />
                  ) : (
                    <p className="text-sm font-medium text-mist">{value}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
