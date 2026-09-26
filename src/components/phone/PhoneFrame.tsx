import * as React from "react";
import { cn } from "@/lib/utils";
import { useRegionalTheme } from "@/hooks/useRegionalTheme";
import { RegionalEmblem } from "@/components/theme/Emblems";
import { themeCssVars } from "@/lib/regionalThemes";

interface ResolvedWallpaper {
  kind: "css" | "image";
  value: string;
}

interface PhoneFrameProps {
  children: React.ReactNode;
  wallpaper?: ResolvedWallpaper | null;
  className?: string;
}

/**
 * The physical PokéGear chrome — a regional-collectible smartphone. The
 * bezel gradient, top emblem ornament, bottom decoration, and side-button
 * accent all repaint automatically from the active RegionalTheme (read from
 * context, provided by PhoneLayout based on the trainer's city), wrapping
 * the same dark screen viewport every app renders into.
 *
 * Responsive: on real phone-sized viewports (< sm) the bezel would waste
 * screen space, so the frame goes full-bleed and behaves like a native app.
 * From sm up it renders as a fixed-proportion phone mockup (clamp-sized,
 * ~360–540px, see .phone-shell in index.css) centered on an ambient
 * background, so it never looks like a stretched dashboard and never
 * shrinks to a tiny, hard-to-use mockup on desktop.
 *
 * Readability: a fixed dark scrim sits between the wallpaper and all screen
 * content regardless of theme, so text and icons stay legible on every
 * region's wallpaper.
 */
export function PhoneFrame({ children, wallpaper, className }: PhoneFrameProps) {
  const theme = useRegionalTheme();

  const screenStyle: React.CSSProperties = { ...themeCssVars(theme) };
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
          "phone-shell relative flex h-[100dvh] w-full flex-col rounded-none p-0 shadow-none",
          "sm:rounded-phone sm:p-3 sm:shadow-phone-bezel",
          className
        )}
        style={{ background: theme.bezelGradient }}
      >
        {/* Regional emblem ornament, replacing a generic camera dot */}
        <div className="absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 sm:block">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: theme.emblemGlow }}
          >
            <RegionalEmblem
              themeKey={theme.key}
              className="h-5 w-5 drop-shadow-[0_0_4px_rgba(0,0,0,0.4)]"
              style={{ color: theme.colors.secondary }}
            />
          </div>
        </div>

        {/* Screen */}
        <div
          className="relative mt-0 flex-1 overflow-hidden rounded-none bg-screen-ink shadow-inner sm:mt-8 sm:rounded-screen"
          style={screenStyle}
        >
          <div className="absolute inset-0 bg-screen-noise" />
          <div className="absolute inset-0 bg-gradient-to-b from-screen-ink/25 via-transparent to-screen-ink/70" />
          <div className="relative z-10 flex h-full flex-col">{children}</div>
        </div>

        {/* Bottom ornament (desktop mockup only) */}
        <div className="mt-2 hidden justify-center sm:flex">
          <div
            className="h-1.5 w-10 rounded-full opacity-70"
            style={{ background: `linear-gradient(90deg, transparent, ${theme.colors.secondary}, transparent)` }}
          />
        </div>

        {/* Side buttons, tinted by region */}
        <div
          className="absolute -right-[3px] top-28 hidden h-14 w-[3px] rounded-l-full sm:block"
          style={{ background: theme.colors.primaryLight, opacity: 0.7 }}
        />
        <div
          className="absolute -left-[3px] top-24 hidden h-10 w-[3px] rounded-r-full sm:block"
          style={{ background: theme.colors.primaryLight, opacity: 0.7 }}
        />
        <div
          className="absolute -left-[3px] top-40 hidden h-10 w-[3px] rounded-r-full sm:block"
          style={{ background: theme.colors.primaryLight, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}
