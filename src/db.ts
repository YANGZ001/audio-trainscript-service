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

const g = globalThis as typeof globalThis & {
  __db?: Database.Database;
  __dbStmts?: {
    insert: Database.Statement;
    list: Database.Statement;
    delete: Database.Statement;
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
  )
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
