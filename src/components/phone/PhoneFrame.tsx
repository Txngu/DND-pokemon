import * as React from "react";
import { cn } from "@/lib/utils";

interface ResolvedWallpaper {
  kind: "css" | "image";
  value: string;
}

interface PhoneFrameProps {
  children: React.ReactNode;
  wallpaper?: ResolvedWallpaper | null;
  accentColor?: string | null;
  className?: string;
}

/**
 * The physical Rotom Phone chrome: a red bezel with a single glowing "eye"
 * camera dot, wrapping a dark rounded screen viewport.
 *
 * Responsive behaviour: on real phone-sized viewports (< sm breakpoint) the
 * "phone within a phone" bezel would just waste screen space, so the frame
 * goes full-bleed and behaves like a native app. From the sm breakpoint up
 * (tablet, laptop, desktop) it renders as a fixed-size phone mockup centered
 * on an ambient background, so it still reads as a smartphone rather than a
 * stretched dashboard.
 *
 * Readability: no matter which wallpaper is active, a fixed dark scrim sits
 * between the wallpaper and all screen content, so text and icons stay
 * legible regardless of how bright or busy the chosen wallpaper is.
 */
export function PhoneFrame({ children, wallpaper, accentColor, className }: PhoneFrameProps) {
  const screenStyle: React.CSSProperties = {
    ...(accentColor ? ({ "--city-accent": accentColor } as React.CSSProperties) : {}),
  };
  if (wallpaper?.kind === "image") {
    screenStyle.backgroundImage = `url(${wallpaper.value})`;
    screenStyle.backgroundSize = "cover";
    screenStyle.backgroundPosition = "center";
  } else if (wallpaper?.kind === "css") {
    screenStyle.background = wallpaper.value;
  }

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-rotom-gradient sm:px-4 sm:py-8">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full flex-col rounded-none bg-gradient-to-b from-rotom-red to-rotom-red-dark p-0 shadow-none",
          "sm:h-[780px] sm:max-h-[92vh] sm:w-[380px] sm:max-w-[92vw] sm:rounded-phone sm:p-3 sm:shadow-phone-bezel",
          className
        )}
      >
        {/* Rotom "eye" — only shown when the bezel itself is visible */}
        <div className="absolute left-1/2 top-5 z-20 hidden -translate-x-1/2 items-center gap-1.5 sm:flex">
          <span className="h-2 w-2 animate-pulse-glow rounded-full bg-volt shadow-[0_0_10px_2px_rgba(255,210,63,0.7)]" />
        </div>

        {/* Screen */}
        <div className="relative flex-1 overflow-hidden rounded-none bg-screen-ink shadow-inner sm:rounded-screen" style={screenStyle}>
          <div className="absolute inset-0 bg-screen-noise" />
          <div className="absolute inset-0 bg-gradient-to-b from-screen-ink/25 via-transparent to-screen-ink/70" />
          <div className="relative z-10 flex h-full flex-col">{children}</div>
        </div>

        {/* Side buttons (decorative, desktop mockup only) */}
        <div className="absolute -right-[3px] top-28 hidden h-14 w-[3px] rounded-l-full bg-black/30 sm:block" />
        <div className="absolute -left-[3px] top-24 hidden h-10 w-[3px] rounded-r-full bg-black/30 sm:block" />
        <div className="absolute -left-[3px] top-40 hidden h-10 w-[3px] rounded-r-full bg-black/30 sm:block" />
      </div>
    </div>
  );
}
