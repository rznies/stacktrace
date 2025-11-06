const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../database/DatabaseManager');

class FileMonitor {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.watcher = null;
    this.projectPath = null;
    this.sessionId = null;
    this.isWatching = false;
    this.snapshotInterval = null;
    this.activeFiles = new Map(); // Track file changes
    this.snapshotIntervalMs = 30 * 60 * 1000; // 30 minutes
  }

  async startWatching(projectPath, sessionId) {
    try {
      this.projectPath = projectPath;
      this.sessionId = sessionId;

      // Initialize database connection
      await this.dbManager.initialize();

      // Configure chokidar watcher
      this.watcher = chokidar.watch(projectPath, {
        ignored: [
          /(^|[\/\\])\../, // Hidden files
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/*.db',
          '**/coverage/**',
          '**/.next/**',
          '**/.nuxt/**'
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      });

      // Track file changes
      this.watcher
        .on('add', filePath => this.trackFileChange(filePath, 'added'))
        .on('change', filePath => this.trackFileChange(filePath, 'modified'))
        .on('unlink', filePath => this.trackFileChange(filePath, 'deleted'))
        .on('error', error => console.error('File watcher error:', error.message));

      this.isWatching = true;

      // Capture initial snapshot
      await this.captureSnapshot();

      // Set up periodic snapshots every 30 minutes
      this.snapshotInterval = setInterval(() => {
        this.captureSnapshot().catch(error => {
          console.error('Snapshot capture error:', error.message);
        });
      }, this.snapshotIntervalMs);

      console.log(`File monitoring started for ${projectPath} (snapshots every 30 minutes)`);
      return true;

    } catch (error) {
      console.error(`Failed to start file monitoring: ${error.message}`);
      return false;
    }
  }

  async stopWatching() {
    try {
      this.isWatching = false;

      // Capture final snapshot
      if (this.sessionId) {
        await this.captureSnapshot();
      }

      // Clear snapshot interval
      if (this.snapshotInterval) {
        clearInterval(this.snapshotInterval);
        this.snapshotInterval = null;
      }

      // Close watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      // Clear tracked files
      this.activeFiles.clear();
      this.projectPath = null;
      this.sessionId = null;

      console.log('File monitoring stopped');
      return true;

    } catch (error) {
      console.error(`Failed to stop file monitoring: ${error.message}`);
      return false;
    }
  }

  trackFileChange(filePath, changeType) {
    if (!this.isWatching) return;

    try {
      const relativePath = path.relative(this.projectPath, filePath);
      this.activeFiles.set(relativePath, {
        path: relativePath,
        absolutePath: filePath,
        changeType: changeType,
        timestamp: new Date()
      });
    } catch (error) {
      console.error(`Error tracking file change: ${error.message}`);
    }
  }

  async captureSnapshot() {
    if (!this.sessionId || !this.isWatching) {
      return;
    }

    try {
      const filesToCapture = Array.from(this.activeFiles.values());

      if (filesToCapture.length === 0) {
        console.log('No file changes to capture in snapshot');
        return;
      }

      // Capture each file's details
      for (const fileInfo of filesToCapture) {
        try {
          let fileSize = null;
          let lastModified = null;

          // Get file stats if file still exists (not deleted)
          if (fileInfo.changeType !== 'deleted' && fs.existsSync(fileInfo.absolutePath)) {
            const stats = fs.statSync(fileInfo.absolutePath);
            fileSize = stats.size;
            lastModified = stats.mtime.toISOString();
          }

          await this.dbManager.insertSnapshot(this.sessionId, {
            filePath: fileInfo.path,
            fileSize: fileSize,
            lastModified: lastModified,
            changeType: fileInfo.changeType
          });

        } catch (error) {
          console.error(`Error capturing file ${fileInfo.path}:`, error.message);
        }
      }

      console.log(`Snapshot captured: ${filesToCapture.length} files`);

      // Clear active files after snapshot
      this.activeFiles.clear();

    } catch (error) {
      console.error('Failed to capture snapshot:', error.message);
    }
  }

  getActiveFiles() {
    return Array.from(this.activeFiles.values()).map(file => ({
      path: file.path,
      changeType: file.changeType,
      timestamp: file.timestamp
    }));
  }

  getMonitoringStatus() {
    return {
      isWatching: this.isWatching,
      projectPath: this.projectPath,
      sessionId: this.sessionId,
      activeFileCount: this.activeFiles.size,
      snapshotInterval: this.snapshotIntervalMs / 1000 / 60 // in minutes
    };
  }
}

module.exports = FileMonitor;