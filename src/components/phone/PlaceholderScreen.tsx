import * as React from "react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";

interface PlaceholderScreenProps {
  title: string;
  icon: React.ReactNode;
  message: string;
}

export function PlaceholderScreen({ title, icon, message }: PlaceholderScreenProps) {
  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title={title} subtitle="Coming soon" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
        <div className="glass flex h-20 w-20 items-center justify-center rounded-3xl text-volt">{icon}</div>
        <p className="font-sans text-sm text-mist/70">{message}</p>
      </div>
    </div>
  );
}
