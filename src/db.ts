import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

export interface TranscriptionRow {
  id: number;
  source_type: 'bilibili' | 'snipd' | 'xiaoyuzhou';
  source_url: string;
  title: string | null;
  owner_name: string | null;
  duration: number | null;
  transcript: string;
  created_at: string;
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';
export type JobStage = 'downloading' | 'uploading' | 'transcribing';

export interface JobRow {
  id: number;
  source_type: 'bilibili' | 'snipd' | 'xiaoyuzhou';
  source_url: string;
  model: string | null;
  status: JobStatus;
  stage: JobStage | null;
  progress: number | null;
  error: string | null;
  transcription_id: number | null;
  created_at: string;
  updated_at: string;
}

const g = globalThis as typeof globalThis & {
  __db?: Database.Database;
  __dbStmts?: {
    insert: Database.Statement;
    list: Database.Statement;
    delete: Database.Statement;
    getTranscription: Database.Statement;
    enqueueJob: Database.Statement;
    claimNextJob: Database.Statement;
    setJobStage: Database.Statement;
    markJobDone: Database.Statement;
    markJobFailed: Database.Statement;
    listJobs: Database.Statement;
    getJob: Database.Statement;
    requeueProcessingJobs: Database.Statement;
    pruneDoneJobs: Database.Statement;
    cancelJob: Database.Statement;
    logApiCall: Database.Statement;
    countApiCalls: Database.Statement;
    pruneApiCalls: Database.Statement;
  };
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transcriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT    NOT NULL,
    source_url  TEXT    NOT NULL,
    title       TEXT,
    owner_name  TEXT,
    duration    INTEGER,
    transcript  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type      TEXT    NOT NULL,
    source_url       TEXT    NOT NULL,
    model            TEXT,
    status           TEXT    NOT NULL,
    stage            TEXT,
    progress         INTEGER,
    error            TEXT,
    transcription_id INTEGER,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_calls (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL,
    ts    TEXT NOT NULL
  );
`;

const MIGRATIONS: string[] = [
  // Future additive ALTER TABLE statements go here.
];

function getDb(): Database.Database {
  if (!g.__db) {
    const dbPath = process.env.DB_PATH ?? '/data/db/transcriptions.db';
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    g.__db = new Database(dbPath);
    g.__db.pragma('journal_mode = WAL');
    g.__db.pragma('foreign_keys = ON');
    // Wait (rather than throw SQLITE_BUSY) if a write briefly contends with a
    // concurrent read — so a completed transcript is never lost to a lock blip.
    g.__db.pragma('busy_timeout = 5000');
    g.__db.exec(SCHEMA);
    for (const migration of MIGRATIONS) {
      try {
        g.__db.exec(migration);
      } catch (err) {
        logger.warn({ err }, 'db migration skipped');
      }
    }
  }
  return g.__db;
}

function getStmts() {
  if (!g.__dbStmts) {
    const db = getDb();
    g.__dbStmts = {
      insert: db.prepare(
        `INSERT INTO transcriptions (source_type, source_url, title, owner_name, duration, transcript, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ),
      list: db.prepare('SELECT * FROM transcriptions ORDER BY created_at DESC'),
      delete: db.prepare('DELETE FROM transcriptions WHERE id = ?'),
      getTranscription: db.prepare('SELECT * FROM transcriptions WHERE id = ?'),
      enqueueJob: db.prepare(
        `INSERT INTO jobs (source_type, source_url, model, status, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, ?)`
      ),
      claimNextJob: db.prepare(
        `UPDATE jobs SET status = 'processing', updated_at = ?
         WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1)
         RETURNING *`
      ),
      setJobStage: db.prepare(
        'UPDATE jobs SET stage = ?, progress = ?, updated_at = ? WHERE id = ?'
      ),
      markJobDone: db.prepare(
        `UPDATE jobs SET status = 'done', stage = NULL, transcription_id = ?, updated_at = ? WHERE id = ?`
      ),
      markJobFailed: db.prepare(
        `UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
      ),
      listJobs: db.prepare(`SELECT * FROM jobs WHERE status != 'done' ORDER BY created_at DESC`),
      getJob: db.prepare('SELECT * FROM jobs WHERE id = ?'),
      requeueProcessingJobs: db.prepare(
        `UPDATE jobs SET status = 'queued', stage = NULL, progress = NULL, updated_at = ? WHERE status = 'processing'`
      ),
      pruneDoneJobs: db.prepare(`DELETE FROM jobs WHERE status = 'done' AND updated_at < ?`),
      cancelJob: db.prepare(`DELETE FROM jobs WHERE id = ? AND status IN ('queued', 'failed')`),
      logApiCall: db.prepare('INSERT INTO api_calls (model, ts) VALUES (?, ?)'),
      countApiCalls: db.prepare('SELECT COUNT(*) AS n FROM api_calls WHERE model = ? AND ts > ?'),
      pruneApiCalls: db.prepare('DELETE FROM api_calls WHERE ts < ?'),
    };
  }
  return g.__dbStmts;
}

export function insertTranscription(params: {
  source_type: 'bilibili' | 'snipd' | 'xiaoyuzhou';
  source_url: string;
  title?: string;
  owner_name?: string;
  duration?: number;
  transcript: string;
}): number {
  const result = getStmts().insert.run(
    params.source_type,
    params.source_url,
    params.title ?? null,
    params.owner_name ?? null,
    params.duration ?? null,
    params.transcript,
    new Date().toISOString(),
  );
  return result.lastInsertRowid as number;
}

export function listTranscriptions(): TranscriptionRow[] {
  return getStmts().list.all() as TranscriptionRow[];
}

export function deleteTranscription(id: number): void {
  getStmts().delete.run(id);
}

export function getTranscription(id: number): TranscriptionRow | undefined {
  return getStmts().getTranscription.get(id) as TranscriptionRow | undefined;
}

export function enqueueJob(params: {
  source_type: 'bilibili' | 'snipd' | 'xiaoyuzhou';
  source_url: string;
  model?: string;
}): number {
  const now = new Date().toISOString();
  const result = getStmts().enqueueJob.run(
    params.source_type,
    params.source_url,
    params.model ?? null,
    now,
    now,
  );
  return result.lastInsertRowid as number;
}

export function claimNextJob(): JobRow | undefined {
  return getStmts().claimNextJob.get(new Date().toISOString()) as JobRow | undefined;
}

export function setJobStage(id: number, stage: JobStage, progress?: number): void {
  getStmts().setJobStage.run(stage, progress ?? null, new Date().toISOString(), id);
}

export function markJobDone(id: number, transcriptionId: number): void {
  getStmts().markJobDone.run(transcriptionId, new Date().toISOString(), id);
}

export function markJobFailed(id: number, error: string): void {
  getStmts().markJobFailed.run(error, new Date().toISOString(), id);
}

// Active and failed jobs only — `done` jobs are excluded (their transcript lives
// in History) and pruned by the worker, so the polling payload stays small.
export function listJobs(): JobRow[] {
  return getStmts().listJobs.all() as JobRow[];
}

// Deletes `done` jobs older than `ttlMs`. The short retention lets an in-flight
// /api/transcribe tail read the linked transcript before the row disappears.
export function pruneDoneJobs(ttlMs: number): void {
  getStmts().pruneDoneJobs.run(new Date(Date.now() - ttlMs).toISOString());
}

export function getJob(id: number): JobRow | undefined {
  return getStmts().getJob.get(id) as JobRow | undefined;
}

// Jobs left in 'processing' when the process stopped are orphaned (the single
// worker is the only thing that processes them). Reset them to 'queued' at boot.
export function requeueProcessingJobs(): number {
  return getStmts().requeueProcessingJobs.run(new Date().toISOString()).changes;
}

export function cancelJob(id: number): boolean {
  return getStmts().cancelJob.run(id).changes > 0;
}

export function logApiCall(model: string): void {
  getStmts().logApiCall.run(model, new Date().toISOString());
  // Opportunistically drop ledger rows older than 24h to keep the table small.
  getStmts().pruneApiCalls.run(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
}

export function countApiCalls(model: string, sinceMs: number): number {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const row = getStmts().countApiCalls.get(model, since) as { n: number };
  return row.n;
}
