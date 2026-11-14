// The team's faces: twelve robots drawn from boxes on a 64-unit grid, so they need no image files and stay sharp at any size.
// Each has its own head shape, face, antenna and colours; they read apart at 26px. A role keeps its robot and its name.
import { useMemo } from "react";

type P = React.CSSProperties;
type Draw = (R: (x: number, y: number, w: number, h: number, bg: string, r?: number | string | number[], extra?: P) => P, g: (c: string) => P, b: (w: number, c: string, side?: "bottom") => P, px: (n: number) => string) => P[];
type Robot = { name: string; hue: number; draw: Draw };

const ROBOTS: Record<string, Robot> = {
  mara: { name: "Mara", hue: 14, draw: (R, g, b) => [
    R(31, 6, 2, 10, "#8b3d2c"), R(28, 2, 8, 8, "#ffd166", "50%", g("#ffd166")),
    R(14, 46, 36, 22, "#d9674a", [18, 18, 0, 0]), R(28, 52, 8, 8, "#fff3d6", "50%"),
    R(10, 26, 7, 11, "#d9674a", 3), R(47, 26, 7, 11, "#d9674a", 3),
    R(17, 14, 30, 29, "#ff8f70", 14),
    R(21, 33, 5, 3, "rgba(255,255,255,0.55)", 3), R(38, 33, 5, 3, "rgba(255,255,255,0.55)", 3),
    R(22, 22, 9, 9, "#fff", "50%"), R(33, 22, 9, 9, "#fff", "50%"), R(25, 25, 4, 4, "#3a1d14", "50%"), R(36, 25, 4, 4, "#3a1d14", "50%"),
    R(26, 33, 12, 6, "transparent", [0, 0, 7, 7], b(2, "#8b3d2c", "bottom")),
  ] },
  idris: { name: "Idris", hue: 172, draw: (R, g) => [
    R(20, 7, 3, 9, "#218f85", 1), R(18, 3, 7, 5, "#ffd166", 1.5), R(41, 7, 3, 9, "#218f85", 1), R(39, 3, 7, 5, "#ffd166", 1.5),
    R(14, 46, 36, 22, "#218f85", [10, 10, 0, 0]), R(23, 52, 18, 7, "#c9f4ee", 3),
    R(15, 14, 34, 29, "#3cc6b8", 8),
    R(19, 22, 26, 12, "#12363a", 5), R(23, 25, 6, 6, "#7dfcf0", 2, g("#7dfcf0")), R(35, 25, 6, 6, "#7dfcf0", 2, g("#7dfcf0")),
    R(27, 37, 10, 2, "#12363a", 1),
  ] },
  noor: { name: "Noor", hue: 262, draw: (R, g) => [
    R(14, 46, 36, 22, "#5b4bd1", [12, 12, 0, 0]), R(26, 53, 12, 6, "#d9d3ff", 3),
    R(15, 25, 5, 9, "#5b4bd1", 2), R(44, 25, 5, 9, "#5b4bd1", 2),
    R(19, 15, 26, 29, "#8a7bff", 10),
    R(20, 4, 24, 12, "#ffd166", [12, 12, 0, 0]), R(16, 14, 32, 3, "#e0a92c", 2), R(30, 5, 4, 7, "#e0a92c", 1),
    R(24, 22, 16, 16, "#1d1a4d", "50%"), R(27.5, 25.5, 9, 9, "#7ee8ff", "50%", g("#7ee8ff")), R(30, 28, 4, 4, "#1d1a4d", "50%"),
    R(28, 40, 8, 2, "#1d1a4d", 1),
  ] },
  kofi: { name: "Kofi", hue: 34, draw: (R, g, _b, px) => [
    R(12, 46, 40, 22, "#b8691a", [8, 8, 0, 0]), R(26, 52, 12, 6, "#ffd9a8", 2),
    R(8, 24, 8, 11, "#b8691a", 2), R(48, 24, 8, 11, "#b8691a", 2), R(30, 9, 4, 8, "#b8691a", 1),
    R(14, 16, 36, 27, "#ff9f3c", 5),
    R(19, 22, 11, 11, "#15301c", 2), R(21, 24, 7, 7, "#5cff8a", 1, g("#5cff8a")), R(34, 22, 11, 11, "#15301c", 2), R(36, 24, 7, 7, "#5cff8a", 1, g("#5cff8a")),
    R(23, 36, 18, 5, `repeating-linear-gradient(90deg,#7a3f0a 0 ${px(2)},#ffcf8f ${px(2)} ${px(4)})`, 2),
  ] },
  lena: { name: "Lena", hue: 140, draw: (R, _g, b, px) => [
    R(21, 7, 2, 10, "#3f9d5d", 1), R(18, 3, 8, 8, "#fff", "50%", { boxShadow: `inset 0 0 0 ${px(2)} #3f9d5d` }),
    R(41, 7, 2, 10, "#3f9d5d", 1), R(38, 3, 8, 8, "#fff", "50%", { boxShadow: `inset 0 0 0 ${px(2)} #3f9d5d` }),
    R(14, 46, 36, 22, "#3f9d5d", [16, 16, 0, 0]),
    R(16, 14, 32, 29, "#6fd08c", 16),
    R(19, 19, 16, 16, "#fff", "50%", b(3, "#245c37")), R(24.5, 24.5, 5, 5, "#245c37", "50%"), R(38, 24, 8, 8, "#fff", "50%"), R(40.5, 26.5, 3, 3, "#245c37", "50%"),
    R(29, 36, 7, 7, "transparent", "50%", b(2, "#245c37")),
  ] },
  sade: { name: "Sade", hue: 222, draw: (R, _g, b) => [
    R(14, 46, 36, 22, "#2c5fc9", [10, 10, 0, 0]), R(28, 50, 8, 12, "#d5e3ff", [1, 1, 4, 4]),
    R(12, 24, 7, 12, "#2c5fc9", 2), R(45, 24, 7, 12, "#2c5fc9", 2),
    R(18, 14, 28, 29, "#4f8cff", 8),
    R(20, 23, 12, 12, "#fff", "50%", b(2.5, "#12285e")), R(32, 23, 12, 12, "#fff", "50%", b(2.5, "#12285e")), R(31, 28, 2, 2, "#12285e"),
    R(24.5, 27.5, 3.5, 3.5, "#12285e", "50%"), R(36.5, 27.5, 3.5, 3.5, "#12285e", "50%"),
    R(21, 18, 9, 2, "#12285e", 1, { transform: "rotate(8deg)" }), R(34, 18, 9, 2, "#12285e", 1, { transform: "rotate(-8deg)" }),
    R(27, 38, 10, 2, "#12285e", 1),
  ] },
  zane: { name: "Zane", hue: 38, draw: (R, g) => [
    R(12, 46, 40, 22, "#3a4252", [6, 6, 0, 0]), R(27, 51, 10, 13, "#ffb020", [2, 2, 6, 6]),
    R(26, 3, 3, 10, "#3a4252", 1), R(35, 3, 3, 10, "#3a4252", 1),
    R(14, 12, 36, 32, "#6b7689", 0, { clipPath: "polygon(25% 0,75% 0,100% 30%,100% 70%,75% 100%,25% 100%,0 70%,0 30%)" }),
    R(18, 24, 28, 10, "#161a22", 4), R(21, 27.5, 22, 3, "#ffb020", 2, g("#ffb020")),
    R(24, 37, 16, 4, "#3a4252", 2),
  ] },
  rafi: { name: "Rafi", hue: 205, draw: (R, g, b) => [
    R(14, 46, 36, 22, "#aab5c6", [10, 10, 0, 0]),
    R(11, 33, 8, 13, "#e5484d", [6, 0, 0, 6]), R(45, 33, 8, 13, "#e5484d", [0, 6, 6, 0]),
    R(18, 9, 28, 35, "#e3e9f1", [14, 14, 8, 8]), R(22, 5, 20, 13, "#e5484d", [10, 10, 0, 0]), R(18, 29, 28, 3, "#e5484d"),
    R(25, 19, 14, 14, "#1b2a41", "50%"), R(28, 22, 8, 8, "#6ec8ff", "50%", g("#6ec8ff")),
    R(28, 36, 8, 5, "transparent", [0, 0, 4, 4], b(2, "#8b95a5", "bottom")),
  ] },
  wren: { name: "Wren", hue: 42, draw: (R, _g, b) => [
    R(36, 4, 3, 16, "#b0793a", 1, { transform: "rotate(18deg)", transformOrigin: "bottom" }), R(41, 0, 7, 11, "#fff", [7, 0, 7, 0], { transform: "rotate(18deg)" }),
    R(14, 46, 36, 22, "#b0793a", [16, 16, 0, 0]), R(26, 44, 12, 6, "#e5484d", 3),
    R(17, 15, 30, 29, "#f4d9a0", 13),
    R(21, 27, 9, 5, "#5a3d1f", [0, 0, 5, 5]), R(34, 27, 9, 5, "#5a3d1f", [0, 0, 5, 5]),
    R(20, 33, 5, 3, "rgba(229,72,77,0.35)", 3), R(39, 33, 5, 3, "rgba(229,72,77,0.35)", 3),
    R(28, 35, 8, 4, "transparent", [0, 0, 4, 4], b(2, "#5a3d1f", "bottom")),
  ] },
  juno: { name: "Juno", hue: 195, draw: (R, g) => [
    R(31, 6, 2, 9, "#1f4d6b"), R(26, 2, 12, 6, "#1f4d6b", [6, 6, 0, 0]),
    R(14, 46, 36, 22, "#2f7fae", [12, 12, 0, 0]), R(26, 52, 12, 6, "#d6f1ff", 3),
    R(16, 14, 32, 29, "#7fd3ff", 12),
    R(18, 18, 13, 16, "#1f4d6b", 6), R(33, 18, 13, 16, "#1f4d6b", 6),
    R(20, 21, 9, 10, "#e8fbff", "50%", g("#bfeaff")), R(35, 21, 9, 10, "#e8fbff", "50%", g("#bfeaff")), R(23, 24, 3.5, 4, "#1f4d6b", "50%"), R(38, 24, 3.5, 4, "#1f4d6b", "50%"),
    R(27, 37, 10, 3, "#1f4d6b", 2),
  ] },
  iris: { name: "Iris", hue: 328, draw: (R) => [
    R(14, 46, 36, 22, "#9b3d8f", [12, 12, 0, 0]), R(24, 52, 16, 7, "#ffd1ec", 3),
    R(17, 14, 30, 29, "#ff7ab8", 10),
    R(18, 8, 28, 9, "#7a2e5e", [14, 14, 2, 2]), R(30, 4, 4, 5, "#7a2e5e", 2),
    R(22, 23, 8, 8, "#fff", 1, { transform: "rotate(45deg)" }), R(34, 23, 8, 8, "#fff", 1, { transform: "rotate(45deg)" }),
    R(24.5, 25.5, 3, 3, "#7a2e5e", "50%"), R(36.5, 25.5, 3, 3, "#7a2e5e", "50%"),
    R(25, 35, 14, 5, "#7a2e5e", [0, 0, 8, 8]),
  ] },
  otto: { name: "Otto", hue: 88, draw: (R, g, b) => [
    R(31, 6, 2, 9, "#3d4f12"), R(28, 2, 8, 6, "#ff7a3d", 3, g("#ff7a3d")),
    R(12, 46, 40, 22, "#6b8a22", [8, 8, 0, 0]), R(26, 52, 12, 6, "#e4f2b8", 2),
    R(9, 25, 7, 10, "#6b8a22", 2), R(48, 25, 7, 10, "#6b8a22", 2),
    R(15, 14, 34, 29, "#9bbf3e", 6),
    R(20, 20, 15, 15, "#fff", "50%", b(2.5, "#3d4f12")), R(27, 23, 2, 7, "#e5484d", 1, { transform: "rotate(30deg)", transformOrigin: "bottom" }),
    R(39, 25, 6, 6, "#ffcf3a", "50%", g("#ffcf3a")),
    R(24, 38, 16, 3, "#3d4f12", 1),
  ] },
  // The Guide: graphite, with a light-bulb antenna and big round eyes.
  bix: { name: "Bix", hue: 215, draw: (R, g, b) => [
    R(31, 6, 2, 9, "#3b434d"), R(27, 0, 10, 9, "#ffe27a", "50%", g("#ffe27a")),
    R(13, 46, 38, 22, "#5b6470", [10, 10, 0, 0]), R(27, 52, 10, 6, "#e8edf2", 2),
    R(8, 25, 6, 10, "#5b6470", 2), R(50, 25, 6, 10, "#5b6470", 2),
    R(15, 14, 34, 29, "#a9b3c0", 13),
    R(20, 21, 11, 11, "#fff", "50%", b(2.5, "#2d3540")), R(33, 21, 11, 11, "#fff", "50%", b(2.5, "#2d3540")),
    R(24, 25, 3.5, 3.5, "#2d3540", "50%"), R(37, 25, 3.5, 3.5, "#2d3540", "50%"),
    R(26, 36, 12, 3, "#2d3540", 2),
  ] },
};

// Each known role keeps its robot. A role the person made or renamed gets one by its name, the same one every time.
const OF_ROLE: Record<string, string> = {
  "product-partner": "mara", planner: "idris", architect: "noor", builder: "kofi", tester: "lena", reviewer: "sade", "security-performance": "zane",
  "release-engineer": "rafi", scribe: "wren", researcher: "juno", designer: "iris", "operations-engineer": "otto", guide: "bix",
};
const IDS = Object.keys(ROBOTS).filter((k) => k !== "bix"); // the Guide's robot belongs to the Guide alone
export function personaFor(role: string): { id: string; name: string } {
  let id = OF_ROLE[role];
  if (!id) { let h = 0; for (const c of role) h = (h * 31 + c.charCodeAt(0)) >>> 0; id = IDS[h % IDS.length]!; }
  return { id, name: ROBOTS[id]!.name };
}

export type Presence = "working" | "free" | "waiting";
export const PRESENCE_TEXT: Record<Presence, string> = { working: "Working", free: "Free", waiting: "Waiting" };

/** One robot as a round profile picture. `status` adds the presence dot (and a pulsing ring while working). Decorative: the name is always next to it. */
export function Robot({ role, size = 48, status }: { role: string; size?: number; status?: Presence }) {
  const id = personaFor(role).id;
  const parts = useMemo(() => {
    const k = size / 64, px = (n: number) => `${(n * k).toFixed(1)}px`;
    const rad = (r?: number | string | number[]) => (r == null ? 0 : Array.isArray(r) ? r.map(px).join(" ") : typeof r === "number" ? px(r) : r);
    const R = (x: number, y: number, w: number, h: number, bg: string, r?: number | string | number[], extra?: P): P =>
      ({ position: "absolute", left: px(x), top: px(y), width: px(w), height: px(h), background: bg, borderRadius: rad(r), ...extra });
    const g = (c: string): P => ({ boxShadow: `0 0 ${px(6)} ${c}` });
    const b = (w: number, c: string, side?: "bottom"): P => {
      const line = `${Math.max(1, w * k).toFixed(1)}px solid ${c}`;
      return side ? { borderBottom: line } : { border: line };
    };
    return ROBOTS[id]!.draw(R, g, b, px);
  }, [id, size]);
  const hue = ROBOTS[id]!.hue, dot = Math.max(9, size * 0.22);
  return (
    <span className={`robot${status === "working" ? " pulse" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="disc" style={{ background: `radial-gradient(circle at 30% 22%, hsl(${hue} 85% 94%), hsl(${hue} 65% 74%))` }}>
        {parts.map((style, i) => <span key={i} style={style} />)}
      </span>
      {status && <span className={`presence ${status}`} style={{ width: dot, height: dot }} />}
    </span>
  );
}
