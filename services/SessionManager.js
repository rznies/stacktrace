const DatabaseManager = require('../database/DatabaseManager');
const path = require('path');
const fs = require('fs');

class SessionManager {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.currentSession = null;
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.dbManager.initialize();
      this.initialized = true;
    }
  }

  async startSession(projectPath, options = {}) {
    try {
      await this.initialize();

      // Validate project path
      const resolvedPath = path.resolve(projectPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Project path does not exist: ${resolvedPath}`);
      }

      // Check if there's already an active session
      const activeSession = await this.dbManager.getActiveSession();
      if (activeSession) {
        throw new Error(`Session already active (ID: ${activeSession.id}). Stop the current session first.`);
      }

      // Create new session
      const sessionId = await this.dbManager.createSession(resolvedPath);
      this.currentSession = await this.dbManager.getSessionById(sessionId);

      return {
        success: true,
        sessionId: sessionId,
        projectPath: resolvedPath,
        startTime: this.currentSession.start_time,
        message: `Started tracking session for project: ${resolvedPath}`
      };
    } catch (error) {
      throw new Error(`Failed to start session: ${error.message}`);
    }
  }

  async stopSession() {
    try {
      await this.initialize();

      const activeSession = await this.dbManager.getActiveSession();
      if (!activeSession) {
        return {
          success: false,
          message: 'No active session to stop'
        };
      }

      const stopped = await this.dbManager.endSession(activeSession.id);
      if (stopped) {
        this.currentSession = null;
        return {
          success: true,
          sessionId: activeSession.id,
          message: `Stopped tracking session (ID: ${activeSession.id})`
        };
      } else {
        return {
          success: false,
          message: 'Failed to stop session'
        };
      }
    } catch (error) {
      throw new Error(`Failed to stop session: ${error.message}`);
    }
  }

  async getSessionStatus() {
    try {
      await this.initialize();

      const activeSession = await this.dbManager.getActiveSession();
      if (!activeSession) {
        return {
          active: false,
          message: 'No active tracking session'
        };
      }

      // Calculate session duration
      const startTime = new Date(activeSession.start_time);
      const now = new Date();
      const duration = Math.floor((now - startTime) / 1000); // Duration in seconds

      // Get session statistics
      const stats = await this.dbManager.getSessionStats(activeSession.id);

      return {
        active: true,
        sessionId: activeSession.id,
        projectPath: activeSession.project_path,
        startTime: activeSession.start_time,
        duration: this.formatDuration(duration),
        durationSeconds: duration,
        stats: {
          snapshots: stats.snapshots,
          gitEvents: stats.gitEvents
        }
      };
    } catch (error) {
      throw new Error(`Failed to get session status: ${error.message}`);
    }
  }

  async isSessionActive() {
    try {
      await this.initialize();
      const activeSession = await this.dbManager.getActiveSession();
      return activeSession !== undefined;
    } catch (error) {
      throw new Error(`Failed to check session status: ${error.message}`);
    }
  }

  getCurrentSession() {
    return this.currentSession;
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  async cleanup() {
    if (this.dbManager) {
      this.dbManager.close();
    }
  }
}

module.exports = SessionManager;