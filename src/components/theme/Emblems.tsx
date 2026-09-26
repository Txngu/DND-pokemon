import type { SVGProps } from "react";
import type { ThemeKey } from "@/lib/regionalThemes";

type EmblemProps = SVGProps<SVGSVGElement>;

/** Harmonia — compass / star rose */
export function CompassEmblem(props: EmblemProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <path d="M24 6 L28 22 L24 24 L20 22 Z" fill="currentColor" />
      <path d="M24 42 L20 26 L24 24 L28 26 Z" fill="currentColor" opacity="0.55" />
      <path d="M6 24 L22 20 L24 24 L22 28 Z" fill="currentColor" opacity="0.35" />
      <path d="M42 24 L26 28 L24 24 L26 20 Z" fill="currentColor" opacity="0.35" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
    </svg>
  );
}

/** Wind City — stylized wing */
export function WingEmblem(props: EmblemProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M8 30 C14 22 16 12 24 7 C22 16 24 21 30 24 C24 26 22 32 24 41 C16 38 10 36 8 30 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path d="M24 7 C28 14 34 16 41 15 C36 20 30 22 24 20" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      <path d="M24 20 C29 23 34 23 40 21" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
    </svg>
  );
}

/** Blütenhain — maple leaf */
export function LeafEmblem(props: EmblemProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M24 6 L27 16 L36 11 L31 20 L42 21 L32 26 L39 34 L28 31 L29 42 L24 33 L19 42 L20 31 L9 34 L16 26 L6 21 L17 20 L12 11 L21 16 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path d="M24 21 L24 40" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
    </svg>
  );
}

/** Crystal City — faceted gem */
export function CrystalEmblem(props: EmblemProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 16 L24 8 L36 16 L24 42 Z" fill="currentColor" opacity="0.85" />
      <path d="M12 16 L36 16 L24 42 Z" fill="currentColor" opacity="0.5" />
      <path d="M12 16 L24 22 L36 16 M24 8 L24 22 M24 22 L24 42" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

const EMBLEMS: Record<ThemeKey, (props: EmblemProps) => React.JSX.Element> = {
  harmonia: CompassEmblem,
  windcity: WingEmblem,
  blutenhain: LeafEmblem,
  crystalcity: CrystalEmblem,
  default: CompassEmblem,
};

export function RegionalEmblem({ themeKey, ...props }: { themeKey: ThemeKey } & EmblemProps) {
  const Emblem = EMBLEMS[themeKey] ?? EMBLEMS.default;
  return <Emblem {...props} />;
}
