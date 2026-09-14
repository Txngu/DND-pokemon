import * as React from "react";
import { cn } from "@/lib/utils";

interface PhoneFrameProps {
  children: React.ReactNode;
  wallpaper?: string | null;
  className?: string;
}

/**
 * The physical Rotom Phone chrome: a red bezel with a single glowing "eye"
 * camera dot, wrapping a dark rounded screen viewport. All app screens
 * render inside the `.phone-screen` element passed as children.
 */
export function PhoneFrame({ children, wallpaper, className }: PhoneFrameProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-rotom-gradient px-4 py-8">
      <div
        className={cn(
          "relative flex h-[780px] max-h-[92vh] w-[380px] max-w-[92vw] flex-col rounded-phone bg-gradient-to-b from-rotom-red to-rotom-red-dark p-3 shadow-phone-bezel",
          className
        )}
      >
        {/* Rotom "eye" */}
        <div className="absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse-glow rounded-full bg-volt shadow-[0_0_10px_2px_rgba(255,210,63,0.7)]" />
        </div>

        {/* Screen */}
        <div
          className="relative flex-1 overflow-hidden rounded-screen bg-screen-ink shadow-inner"
          style={
            wallpaper
              ? { backgroundImage: `url(${wallpaper})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-screen-noise" />
          <div className="relative z-10 flex h-full flex-col">{children}</div>
        </div>

        {/* Side buttons (decorative) */}
        <div className="absolute -right-[3px] top-28 h-14 w-[3px] rounded-l-full bg-black/30" />
        <div className="absolute -left-[3px] top-24 h-10 w-[3px] rounded-r-full bg-black/30" />
        <div className="absolute -left-[3px] top-40 h-10 w-[3px] rounded-r-full bg-black/30" />
      </div>
    </div>
  );
}
