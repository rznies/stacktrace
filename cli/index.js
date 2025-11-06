#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const SessionManager = require('../services/SessionManager');
const path = require('path');

const program = new Command();
const sessionManager = new SessionManager();

program
  .name('stacktrace')
  .description('Automatically capture your coding journey and generate blog posts')
  .version('1.0.0');

// Start command
program
  .command('start [project_path]')
  .description('Start tracking your coding session')
  .action(async (projectPath) => {
    try {
      const targetPath = projectPath || process.cwd();
      const resolvedPath = path.resolve(targetPath);

      console.log(chalk.blue('🚀 Starting StackTrace session...\n'));

      const result = await sessionManager.startSession(resolvedPath);

      if (result.success) {
        console.log(chalk.green('✓ Session started successfully!'));
        console.log(chalk.gray(`  Session ID: ${result.sessionId}`));
        console.log(chalk.gray(`  Project: ${result.projectPath}`));
        console.log(chalk.gray(`  Started at: ${result.startTime}`));
        console.log(chalk.yellow('\n💡 Tip: Use "stacktrace status" to check your session'));
      }

    } catch (error) {
      console.error(chalk.red('✗ Failed to start session'));
      console.error(chalk.red(`  Error: ${error.message}`));
      process.exit(1);
    }
  });

// Stop command
program
  .command('stop')
  .description('Stop the current tracking session')
  .action(async () => {
    try {
      console.log(chalk.blue('🛑 Stopping StackTrace session...\n'));

      const result = await sessionManager.stopSession();

      if (result.success) {
        console.log(chalk.green('✓ Session stopped successfully!'));
        console.log(chalk.gray(`  Session ID: ${result.sessionId}`));
      } else {
        console.log(chalk.yellow('⚠ ' + result.message));
      }

    } catch (error) {
      console.error(chalk.red('✗ Failed to stop session'));
      console.error(chalk.red(`  Error: ${error.message}`));
      process.exit(1);
    } finally {
      await sessionManager.cleanup();
    }
  });

// Status command
program
  .command('status')
  .description('Show current session status')
  .action(async () => {
    try {
      const status = await sessionManager.getSessionStatus();

      if (status.active) {
        console.log(chalk.green('✓ Active tracking session\n'));
        console.log(chalk.cyan('Session Details:'));
        console.log(chalk.gray(`  Session ID: ${status.sessionId}`));
        console.log(chalk.gray(`  Project: ${status.projectPath}`));
        console.log(chalk.gray(`  Started: ${status.startTime}`));
        console.log(chalk.gray(`  Duration: ${status.duration}`));
        
        console.log(chalk.cyan('\nActivity Stats:'));
        console.log(chalk.gray(`  File snapshots: ${status.stats.snapshots}`));
        console.log(chalk.gray(`  Git events: ${status.stats.gitEvents}`));
      } else {
        console.log(chalk.yellow('⚠ No active tracking session'));
        console.log(chalk.gray('\n💡 Start tracking with: stacktrace start [project_path]'));
      }

    } catch (error) {
      console.error(chalk.red('✗ Failed to get session status'));
      console.error(chalk.red(`  Error: ${error.message}`));
      process.exit(1);
    } finally {
      await sessionManager.cleanup();
    }
  });

// Generate command (placeholder)
program
  .command('generate [timeframe]')
  .description('Generate a blog post from your tracked activity')
  .action(async (timeframe) => {
    try {
      console.log(chalk.blue('📝 Generating blog post...\n'));
      
      const targetTimeframe = timeframe || 'today';
      console.log(chalk.gray(`  Timeframe: ${targetTimeframe}`));
      
      console.log(chalk.yellow('\n⚠ Blog generation coming soon!'));
      console.log(chalk.gray('  This feature will use LLM to create narrative posts from your timeline.'));

    } catch (error) {
      console.error(chalk.red('✗ Failed to generate blog post'));
      console.error(chalk.red(`  Error: ${error.message}`));
      process.exit(1);
    } finally {
      await sessionManager.cleanup();
    }
  });

// Error handling for unknown commands
program.on('command:*', function () {
  console.error(chalk.red('✗ Invalid command: %s'), program.args.join(' '));
  console.log(chalk.gray('\nSee --help for a list of available commands.'));
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}