const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = path.join(process.cwd(), 'stacktrace.db');
  }

  async initialize() {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.createTables();
      return true;
    } catch (error) {
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  createTables() {
    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        status TEXT DEFAULT 'active'
      )
    `;

    const createSnapshotsTable = `
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        last_modified DATETIME,
        change_type TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `;

    const createGitEventsTable = `
      CREATE TABLE IF NOT EXISTS git_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        event_type TEXT NOT NULL,
        branch_name TEXT,
        commit_hash TEXT,
        commit_message TEXT,
        files_changed TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `;

    const createBrowserHistoryTable = `
      CREATE TABLE IF NOT EXISTS browser_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        domain TEXT,
        category TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `;

    this.db.exec(createSessionsTable);
    this.db.exec(createSnapshotsTable);
    this.db.exec(createGitEventsTable);
    this.db.exec(createBrowserHistoryTable);
  }

  async createSession(projectPath) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (project_path, start_time, status)
        VALUES (?, datetime('now'), 'active')
      `);
      
      const result = stmt.run(projectPath);
      return result.lastInsertRowid;
    } catch (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  async endSession(sessionId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE sessions 
        SET end_time = datetime('now'), status = 'completed'
        WHERE id = ? AND status = 'active'
      `);
      
      const result = stmt.run(sessionId);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to end session: ${error.message}`);
    }
  }

  async getActiveSession() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions 
        WHERE status = 'active' 
        ORDER BY start_time DESC 
        LIMIT 1
      `);
      
      return stmt.get();
    } catch (error) {
      throw new Error(`Failed to get active session: ${error.message}`);
    }
  }

  async getSessionById(sessionId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `);
      
      return stmt.get(sessionId);
    } catch (error) {
      throw new Error(`Failed to get session: ${error.message}`);
    }
  }

  async getSessionStats(sessionId) {
    try {
      const snapshotCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM snapshots WHERE session_id = ?
      `).get(sessionId);

      const gitEventCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM git_events WHERE session_id = ?
      `).get(sessionId);

      return {
        snapshots: snapshotCount.count,
        gitEvents: gitEventCount.count
      };
    } catch (error) {
      throw new Error(`Failed to get session stats: ${error.message}`);
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = DatabaseManager;