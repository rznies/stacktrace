const simpleGit = require('simple-git');
const DatabaseManager = require('../database/DatabaseManager');

class GitMonitor {
  constructor() {
    this.git = null;
    this.dbManager = new DatabaseManager();
    this.projectPath = null;
    this.sessionId = null;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.lastCommitHash = null;
    this.lastBranch = null;
    this.pollInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  async startMonitoring(projectPath, sessionId) {
    try {
      this.projectPath = projectPath;
      this.sessionId = sessionId;
      
      // Initialize git for the project path
      this.git = simpleGit(projectPath);
      
      // Check if it's a git repository
      const isRepo = await this.isGitRepository();
      if (!isRepo) {
        console.warn(`Warning: ${projectPath} is not a git repository. Git monitoring disabled.`);
        return false;
      }

      // Initialize database connection
      await this.dbManager.initialize();

      // Get initial state
      await this.captureInitialState();

      // Start polling
      this.isMonitoring = true;
      this.monitoringInterval = setInterval(() => {
        this.pollGitChanges().catch(error => {
          console.error('Git monitoring error:', error.message);
        });
      }, this.pollInterval);

      console.log(`Git monitoring started for ${projectPath} (polling every 5 minutes)`);
      return true;

    } catch (error) {
      console.error(`Failed to start git monitoring: ${error.message}`);
      return false;
    }
  }

  async stopMonitoring() {
    try {
      this.isMonitoring = false;
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Capture final state
      if (this.git && this.sessionId) {
        await this.captureGitEvent('session_end', {
          message: 'Git monitoring stopped'
        });
      }

      this.git = null;
      this.projectPath = null;
      this.sessionId = null;
      this.lastCommitHash = null;
      this.lastBranch = null;

      console.log('Git monitoring stopped');
      return true;

    } catch (error) {
      console.error(`Failed to stop git monitoring: ${error.message}`);
      return false;
    }
  }

  async isGitRepository() {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  async captureInitialState() {
    try {
      const branch = await this.getCurrentBranch();
      const commits = await this.getRecentCommits(1);
      
      if (commits.length > 0) {
        this.lastCommitHash = commits[0].hash;
      }
      this.lastBranch = branch;

      // Record session start
      await this.captureGitEvent('session_start', {
        branchName: branch,
        commitHash: this.lastCommitHash,
        message: `Started monitoring on branch: ${branch}`
      });

    } catch (error) {
      console.error('Failed to capture initial git state:', error.message);
    }
  }

  async pollGitChanges() {
    if (!this.isMonitoring || !this.git) {
      return;
    }

    try {
      // Check for branch changes
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch !== this.lastBranch) {
        await this.captureGitEvent('branch_change', {
          branchName: currentBranch,
          message: `Switched from ${this.lastBranch} to ${currentBranch}`
        });
        this.lastBranch = currentBranch;
      }

      // Check for new commits
      const recentCommits = await this.getRecentCommits(5);
      if (recentCommits.length > 0) {
        const latestCommit = recentCommits[0];
        
        if (latestCommit.hash !== this.lastCommitHash) {
          // Find new commits since last check
          const newCommits = [];
          for (const commit of recentCommits) {
            if (commit.hash === this.lastCommitHash) {
              break;
            }
            newCommits.push(commit);
          }

          // Record each new commit
          for (const commit of newCommits.reverse()) {
            await this.captureGitEvent('commit', {
              branchName: currentBranch,
              commitHash: commit.hash,
              commitMessage: commit.message,
              filesChanged: await this.getCommitFiles(commit.hash)
            });
          }

          this.lastCommitHash = latestCommit.hash;
        }
      }

      // Check for status changes (staged/unstaged files)
      await this.checkStatusChanges();

    } catch (error) {
      console.error('Error during git polling:', error.message);
    }
  }

  async checkStatusChanges() {
    try {
      const status = await this.git.status();
      
      if (status.staged.length > 0 || status.modified.length > 0 || status.not_added.length > 0) {
        const changes = {
          staged: status.staged,
          modified: status.modified,
          untracked: status.not_added,
          deleted: status.deleted
        };

        await this.captureGitEvent('status_change', {
          branchName: await this.getCurrentBranch(),
          message: `Working directory changes detected`,
          filesChanged: changes
        });
      }
    } catch (error) {
      console.error('Error checking git status:', error.message);
    }
  }

  async getCommitFiles(commitHash) {
    try {
      const diff = await this.git.show([commitHash, '--name-only', '--pretty=format:']);
      return diff.split('\n').filter(file => file.trim() !== '');
    } catch (error) {
      console.error('Error getting commit files:', error.message);
      return [];
    }
  }

  async captureGitEvent(eventType, data) {
    try {
      if (!this.sessionId) {
        console.warn('No session ID available for git event capture');
        return null;
      }

      const eventData = {
        eventType,
        branchName: data.branchName || null,
        commitHash: data.commitHash || null,
        commitMessage: data.commitMessage || data.message || null,
        filesChanged: data.filesChanged || null
      };

      const eventId = await this.dbManager.insertGitEvent(this.sessionId, eventData);
      console.log(`Git event captured: ${eventType} (ID: ${eventId})`);
      return eventId;

    } catch (error) {
      console.error(`Failed to capture git event: ${error.message}`);
      return null;
    }
  }

  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch (error) {
      console.error('Error getting current branch:', error.message);
      return 'unknown';
    }
  }

  async getRecentCommits(count = 10) {
    try {
      const log = await this.git.log({ maxCount: count });
      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        refs: commit.refs
      }));
    } catch (error) {
      console.error('Error getting recent commits:', error.message);
      return [];
    }
  }

  // Utility methods for external access
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      projectPath: this.projectPath,
      sessionId: this.sessionId,
      lastCommitHash: this.lastCommitHash,
      lastBranch: this.lastBranch,
      pollInterval: this.pollInterval
    };
  }

  async getGitInfo() {
    if (!this.git) {
      return null;
    }

    try {
      const branch = await this.getCurrentBranch();
      const commits = await this.getRecentCommits(5);
      const status = await this.git.status();

      return {
        currentBranch: branch,
        recentCommits: commits,
        status: {
          staged: status.staged,
          modified: status.modified,
          untracked: status.not_added,
          deleted: status.deleted
        }
      };
    } catch (error) {
      console.error('Error getting git info:', error.message);
      return null;
    }
  }
}

module.exports = GitMonitor;