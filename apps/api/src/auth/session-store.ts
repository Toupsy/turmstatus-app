// ============================================================
// session-store.ts – @fastify/session-Store auf better-sqlite3 (Tabelle `sessions`).
// Synchron, aber die Store-Callbacks werden mit den Ergebnissen aufgerufen.
// ============================================================

import type Database from 'better-sqlite3';
import type { SessionStore } from '@fastify/session';
import type { Session } from 'fastify';

type Callback = (err?: unknown, result?: unknown) => void;

export class SqliteSessionStore implements SessionStore {
  private getStmt: Database.Statement;
  private setStmt: Database.Statement;
  private delStmt: Database.Statement;
  private pruneStmt: Database.Statement;

  constructor(private sqlite: Database.Database) {
    this.getStmt = sqlite.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
    this.setStmt = sqlite.prepare(
      'INSERT INTO sessions (sid, sess, expire) VALUES (@sid, @sess, @expire) ' +
        'ON CONFLICT(sid) DO UPDATE SET sess = @sess, expire = @expire'
    );
    this.delStmt = sqlite.prepare('DELETE FROM sessions WHERE sid = ?');
    this.pruneStmt = sqlite.prepare('DELETE FROM sessions WHERE expire < ?');
    // Verwaiste/abgelaufene Sessions beim Start aufräumen.
    this.pruneStmt.run(Date.now());
  }

  private expiry(session: Session): number {
    const cookieExpires = session.cookie?.expires;
    if (cookieExpires) return new Date(cookieExpires).getTime();
    return Date.now() + 86_400_000; // Fallback 24 h
  }

  set(sid: string, session: Session, callback: Callback): void {
    try {
      this.setStmt.run({ sid, sess: JSON.stringify(session), expire: this.expiry(session) });
      callback();
    } catch (err) {
      callback(err);
    }
  }

  get(sid: string, callback: (err: unknown, result?: Session | null) => void): void {
    try {
      const row = this.getStmt.get(sid) as { sess: string; expire: number } | undefined;
      if (!row) return callback(null, null);
      if (row.expire < Date.now()) {
        this.delStmt.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess) as Session);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid: string, callback: Callback): void {
    try {
      this.delStmt.run(sid);
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /** Alle Sessions eines Benutzers invalidieren (z. B. nach Passwortwechsel/Deaktivierung). */
  destroyUser(userId: number): void {
    const rows = this.sqlite.prepare('SELECT sid, sess FROM sessions').all() as {
      sid: string;
      sess: string;
    }[];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.sess) as { user?: { id?: number } };
        if (parsed.user?.id === userId) this.delStmt.run(row.sid);
      } catch {
        /* defekte Session ignorieren */
      }
    }
  }
}
