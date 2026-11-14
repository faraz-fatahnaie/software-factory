import { Database } from "bun:sqlite";

export type FactoryEvent = {
  run: string;
  task: string;
  stage: string;
  type: string;
  role?: string;
  model?: string;
  data?: unknown;
};

type Row = FactoryEvent & { seq: number; ts: string };
const row = (r: any): Row => ({ ...r, data: r.data == null ? undefined : JSON.parse(r.data) });

/** Append-only event log. Everything the GUI shows is derived from this table. */
export function openStore(path: string) {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    run TEXT NOT NULL, task TEXT NOT NULL, stage TEXT NOT NULL, type TEXT NOT NULL,
    role TEXT, model TEXT, data TEXT)`);
  const insert = db.query(
    "INSERT INTO events (run, task, stage, type, role, model, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  return {
    emit(e: FactoryEvent) {
      const data = e.data === undefined ? null : JSON.stringify(e.data);
      insert.run(e.run, e.task, e.stage, e.type, e.role ?? null, e.model ?? null, data);
    },
    list: (run: string) => db.query("SELECT * FROM events WHERE run = ? ORDER BY seq").all(run).map(row),
    /** Events after a sequence number: what the live stream and replay read. */
    since: (seq: number) => db.query("SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT 1000").all(seq).map(row),
    /** The newest event of a type, optionally for one task. */
    last: (type: string, task?: string) => {
      const r = (task ? db.query("SELECT * FROM events WHERE type = ? AND task = ? ORDER BY seq DESC LIMIT 1").get(type, task) : db.query("SELECT * FROM events WHERE type = ? ORDER BY seq DESC LIMIT 1").get(type)) as any;
      return r ? row(r) : undefined;
    },
    lastRun: (task: string) =>
      (db.query("SELECT run FROM events WHERE task = ? ORDER BY seq DESC LIMIT 1").get(task) as { run: string } | null)?.run,
    close: () => db.close(),
  };
}

export type Store = ReturnType<typeof openStore>;
