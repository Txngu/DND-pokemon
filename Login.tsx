import * as React from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  if (!authLoading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError("Incorrect email or password. Check with your league admin.");
  }

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-volt to-rotom-red shadow-glass">
            <span className="font-display text-2xl font-bold text-screen-ink">P</span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-mist">PokéGear</h1>
          <p className="text-center text-xs text-mist/50">Sign in with the trainer account your league admin set up for you.</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ash@pallet.town"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error ? <p className="text-xs text-rotom-red-light">{error}</p> : null}

          <Button type="submit" variant="volt" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>

        <p className="mt-8 text-center text-[11px] text-mist/40">
          New trainers are registered by an admin. There&apos;s no public sign-up.
        </p>
      </div>
    </PhoneFrame>
  );
}
