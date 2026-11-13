// Data hooks for the page: the live event stream, the polled backlog, the clock and the theme.
import { useEffect, useRef, useState } from "react";
import type { Ev } from "../plugin/engine/state";
import type { TeamData } from "./team";

export type Item = { id: string; prio?: string; title: string; section: string };
export type Backlog = { items: Item[]; running: string[] };
export type Link = "connecting" | "live" | "reconnecting" | "offline";

export async function post(path: string, body: unknown): Promise<{ ok: boolean; error: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, error: data.error ?? data.output ?? `request failed (${res.status})` };
  } catch {
    return { ok: false, error: "The factory server did not answer. Is `factory serve` still running?" };
  }
}

/** The whole event log, live, plus the health of the connection it arrives on. */
export function useEvents(): { events: Ev[]; link: Link } {
  const [events, setEvents] = useState<Ev[]>([]);
  const [link, setLink] = useState<Link>("connecting");
  useEffect(() => {
    // ponytail: keeps every event in memory. Window by run if the log grows past what a tab handles.
    const all: Ev[] = [];
    let queued = false, source: EventSource, retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      // Resume after the last event we hold, so a reconnect never duplicates or drops any.
      source = new EventSource(`/api/events?after=${all.at(-1)?.seq ?? 0}`);
      source.onopen = () => setLink("live");
      source.onmessage = (m) => {
        all.push(JSON.parse(m.data));
        if (queued) return; // one render per batch, however many events replay at once
        queued = true;
        // A timer, not requestAnimationFrame: frames stop in a background tab and the log would stall.
        setTimeout(() => { queued = false; setEvents([...all]); }, 50);
      };
      source.onerror = () => {
        // The browser retries by itself while CONNECTING. Once it gives up, retry here.
        if (source.readyState !== EventSource.CLOSED) return setLink("reconnecting");
        setLink("offline");
        retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { source.close(); clearTimeout(retry); };
  }, []);
  return { events, link };
}

/** The backlog, polled. State changes only when the answer does, so a poll never repaints or resets anything. */
export function useBacklog(): { backlog: Backlog; loaded: boolean; reload: () => void } {
  const [backlog, setBacklog] = useState<Backlog>({ items: [], running: [] });
  const [loaded, setLoaded] = useState(false);
  const last = useRef("");
  const reload = () =>
    fetch("/api/backlog").then((r) => r.text()).then((text) => {
      setLoaded(true);
      if (text === last.current) return;
      last.current = text;
      setBacklog(JSON.parse(text));
    }).catch(() => {});
  useEffect(() => {
    reload();
    // ponytail: polls every 2s, because people also edit BACKLOG.md by hand and that emits no event.
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, []);
  return { backlog, loaded, reload };
}

/** A clock that ticks only while something on screen is counting. */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  return now;
}

/** Light or dark, remembered in this browser. The first paint is set by the script in index.html. */
export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "dark");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("factory-theme", next); } catch { /* private window: the choice lasts for this visit */ }
    setTheme(next);
  };
  return [theme, toggle];
}

/** The current view, kept in the address bar so a reload or a shared link lands in the same place. */
export function useHash<T extends string>(views: readonly T[]): [T, (v: T) => void] {
  const read = () => (views.find((v) => v.toLowerCase() === location.hash.slice(1)) ?? views[0]!) as T;
  const [view, setView] = useState<T>(read);
  useEffect(() => {
    const onChange = () => setView(read());
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return [view, (v) => { location.hash = v.toLowerCase(); }];
}

/** A JSON call that hands back the answer or the server's own explanation. GET when there is no body. */
export async function call<T>(path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: data as T } : { ok: false, error: data.error ?? data.output ?? `request failed (${res.status})` };
  } catch {
    return { ok: false, error: "The factory server did not answer. Is `factory serve` still running?" };
  }
}

/** The team as the Team view reads it, refreshed when `key` changes (for example after more stages finish). null until the first answer. */
export function useTeam(key: number): TeamData | null {
  const [team, setTeam] = useState<TeamData | null>(null);
  useEffect(() => { call<TeamData>("/api/team").then((r) => r.ok && setTeam(r.data)); }, [key]);
  return team;
}
