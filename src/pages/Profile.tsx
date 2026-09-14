import { MapPin, Wallet, Fingerprint, Sparkles } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useCities } from "@/hooks/useProfile";

export default function Profile() {
  const { profile } = usePhoneContext();
  const { data: cities } = useCities();
  const city = cities?.find((c) => c.id === profile.city_id);
  const initials = profile.username.slice(0, 2).toUpperCase();

  const stats = [
    { icon: MapPin, label: "Home city", value: city?.name ?? "Not set" },
    { icon: Wallet, label: "Money", value: `₽${profile.money.toLocaleString()}` },
    { icon: Fingerprint, label: "Trainer ID", value: profile.trainer_id },
    { icon: Sparkles, label: "Favorite Pokémon", value: profile.favorite_pokemon ?? "Not set" },
  ];

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Trainer Profile" />

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center gap-3 pb-6">
          <Avatar className="h-24 w-24 ring-4 ring-volt/50">
            {profile.avatar ? <AvatarImage src={profile.avatar} alt={profile.username} /> : null}
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="font-display text-xl font-semibold text-mist">{profile.username}</p>
            <p className="font-mono text-xs text-mist/50">{profile.email}</p>
          </div>
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
                  <p className="text-sm font-medium text-mist">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
