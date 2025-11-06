const DatabaseManager = require('../database/DatabaseManager');
const FileMonitor = require('../monitors/FileMonitor');
const GitMonitor = require('../monitors/GitMonitor');
const path = require('path');
const fs = require('fs');

class SessionManager {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.fileMonitor = new FileMonitor();
    this.gitMonitor = new GitMonitor();
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

      // Start monitoring services
      try {
        console.log('Starting file monitoring...');
        const fileMonitorStarted = await this.fileMonitor.startWatching(resolvedPath, sessionId);
        
        console.log('Starting git monitoring...');
        const gitMonitorStarted = await this.gitMonitor.startMonitoring(resolvedPath, sessionId);

        const monitoringStatus = [];
        if (fileMonitorStarted) monitoringStatus.push('file monitoring');
        if (gitMonitorStarted) monitoringStatus.push('git monitoring');

        return {
          success: true,
          sessionId: sessionId,
          projectPath: resolvedPath,
          startTime: this.currentSession.start_time,
          message: `Started tracking session for project: ${resolvedPath}`,
          monitoring: monitoringStatus.length > 0 ? monitoringStatus : ['basic session tracking']
        };
      } catch (monitorError) {
        console.warn('Warning: Some monitoring services failed to start:', monitorError.message);
        return {
          success: true,
          sessionId: sessionId,
          projectPath: resolvedPath,
          startTime: this.currentSession.start_time,
          message: `Started tracking session for project: ${resolvedPath}`,
          warning: 'Some monitoring services may not be active'
        };
      }
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

      // Stop monitoring services first
      try {
        console.log('Stopping file monitoring...');
        await this.fileMonitor.stopWatching();
        
        console.log('Stopping git monitoring...');
        await this.gitMonitor.stopMonitoring();
      } catch (monitorError) {
        console.warn('Warning: Error stopping monitoring services:', monitorError.message);
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

      // Get monitoring status
      const fileMonitorStatus = this.fileMonitor.getMonitoringStatus();
      const gitMonitorStatus = this.gitMonitor.getMonitoringStatus();

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
        },
        monitoring: {
          fileMonitoring: {
            active: fileMonitorStatus.isWatching,
            activeFiles: fileMonitorStatus.activeFileCount || 0
          },
          gitMonitoring: {
            active: gitMonitorStatus.isMonitoring,
            currentBranch: gitMonitorStatus.lastBranch || 'unknown'
          }
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
    try {
      // Stop monitoring services
      if (this.fileMonitor) {
        await this.fileMonitor.stopWatching();
      }
      if (this.gitMonitor) {
        await this.gitMonitor.stopMonitoring();
      }
    } catch (error) {
      console.warn('Warning: Error during cleanup:', error.message);
    }

    if (this.dbManager) {
      this.dbManager.close();
    }
  }
}

module.exports = SessionManager;