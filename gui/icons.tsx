// A handful of 24px line icons, drawn inline so the page needs no icon font and no network.
const PATHS: Record<string, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  backlog: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  talk: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  checks: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  check: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  agents: "M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3",
  logs: "M4 17l6-6-6-6 M12 19h8",
  worktrees: "M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9",
  studio: "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  graph: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98",
  source: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 12h6 M15 12h6",
  branch: "M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9",
  commit: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 12h6 M15 12h6",
  pr: "M6 9v6 M6 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M18 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M18 15.5V9a3 3 0 0 0-3-3h-4 M13 3.5L10.5 6 13 8.5",
  merge: "M6 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M18 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 8.5v7 M18 14.5c0 3-3 3-6 3H8.5",
  x: "M18 6L6 18 M6 6l12 12",
  dot: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  sync: "M21 12a9 9 0 0 0-15-6.7L3 8 M3 3v5h5 M3 12a9 9 0 0 0 15 6.7L21 16 M16 16h5v5",
  up: "M12 19V5 M5 12l7-7 7 7",
  down: "M12 5v14 M19 12l-7 7-7-7",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5",
  undo: "M3 7v6h6 M3 13a9 9 0 1 0 3-7.7L3 8",
  copy: "M9 9h10v10H9z M5 15V5h10",
  chevron: "M9 6l6 6-6 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  plus: "M12 5v14 M5 12h14",
  expand: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42",
  tick: "M20 6L9 17l-5-5",
  paperclip: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
  filetext: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6",
  code: "M16 18l6-6-6-6 M8 6l-6 6 6 6",
  terminal: "M4 17l6-6-6-6 M12 19h8",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
};

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.check} />
    </svg>
  );
}
