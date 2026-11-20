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
      (db.query("SELECT run FROM events WHERE task = ? AND stage != 'manager' ORDER BY seq DESC LIMIT 1").get(task) as { run: string } | null)?.run,
    /** US dollars spent since a time (ISO), for one task or for all of them: model stages, and (for the day's total) the conversations and the manager's own model calls, which belong to no task. */
    spent: (since = "", task = "") =>
      (db.query("SELECT COALESCE(SUM(json_extract(data, '$.usage.costUsd')), 0) AS n FROM events WHERE (type LIKE 'stage.%' OR type = 'chat.turn') AND ts >= ? AND (? = '' OR task = ?)").get(since, task, task) as { n: number }).n,
    /** How runs ended, newest first: a finished run, or a failed one that was not stopped on purpose. A run that stopped by design before anything was built (it needs the person's yes, is not ready, or is blocked on something missing) is no failure: it is not a loop, and it cost almost nothing. */
    outcomes: (since = "", limit = 10) =>
      (db.query("SELECT seq, ts, task, type FROM events WHERE (type = 'run.done' OR (type = 'run.failed' AND COALESCE(json_extract(data, '$'), '') NOT LIKE '%stopped%' AND COALESCE(json_extract(data, '$'), '') NOT LIKE 'Error: needs your yes:%' AND COALESCE(json_extract(data, '$'), '') NOT LIKE 'Error: not ready:%' AND COALESCE(json_extract(data, '$'), '') NOT LIKE 'Error: blocked:%')) AND ts > ? ORDER BY seq DESC LIMIT ?").all(since, limit) as { seq: number; ts: string; task: string; type: string }[]),
    /** What the newest finished run of a stage wrote for a task (its spec, its review). Task runs live in the task's own worktree, which is gone once it is approved; the log keeps the text. */
    output: (task: string, stage: string) =>
      (db.query("SELECT json_extract(data, '$.output') AS text FROM events WHERE task = ? AND stage = ? AND type = 'stage.ok' AND json_extract(data, '$.output') IS NOT NULL ORDER BY seq DESC LIMIT 1").get(task, stage) as { text: string } | null)?.text,
    /** When the task last did anything (the manager's own notes do not count). */
    touched: (task: string) => (db.query("SELECT MAX(ts) AS t FROM events WHERE task = ? AND stage != 'manager'").get(task) as { t: string | null }).t,
    /** The type of the newest event of a task (the manager's own notes do not count). */
    lastType: (task: string) => (db.query("SELECT type FROM events WHERE task = ? AND stage != 'manager' ORDER BY seq DESC LIMIT 1").get(task) as { type: string } | null)?.type,
    /** The manager's decisions and notes, newest first. */
    decisions: (task = "", limit = 30) => db.query("SELECT * FROM events WHERE type LIKE 'manager.%' AND (? = '' OR task = ?) ORDER BY seq DESC LIMIT ?").all(task, task, limit).map(row),
    /** Automatic retries of a task since a person last settled it (landed, discarded, or finished a run). */
    retries: (task: string) =>
      (db.query(`SELECT COUNT(*) AS n FROM events WHERE task = ? AND type = 'manager.decision' AND json_extract(data, '$.action') IN ('retry', 'guide')
        AND ts > COALESCE((SELECT MAX(ts) FROM events WHERE task = ? AND type IN ('run.done', 'task.landed', 'task.discarded')), '')`).get(task, task) as { n: number }).n,
    /** Whether any model ran out of quota since a time: a stage hit a rate limit, or a run failed because every model was rate limited. */
    quotaShort: (since: string) =>
      (db.query("SELECT COUNT(*) AS n FROM events WHERE ts > ? AND (type = 'stage.rate_limited' OR (type = 'run.failed' AND data LIKE '%rate limited%'))").get(since) as { n: number }).n > 0,
    close: () => db.close(),
  };
}

export type Store = ReturnType<typeof openStore>;
