#!/usr/bin/env node

/**
 * GitLab Claude Manager - Main Entry Point
 * A TypeScript Node.js project for managing GitLab repositories with Claude Code integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { nanoid } from 'nanoid';
import { initializeConfig } from '@/config/settings.js';
import { CacheManager } from '@/managers/CacheManager.js';
import { RepositoryManager } from '@/managers/RepositoryManager.js';
import { WorkspaceManager } from '@/managers/WorkspaceManager.js';
import type { GitUrl, WorkspaceId } from '@/types/index.js';

const program = new Command();

// Initialize managers
const cacheManager = new CacheManager({
  expiryDays: 7,
  maxCacheSize: 100 * 1024 * 1024, // 100MB
  includePatterns: ['**/*.ts', '**/*.js', '**/*.json', '**/*.md', '**/*.yml', '**/*.yaml'],
  excludePatterns: ['node_modules/**', 'dist/**', '.git/**', '**/.DS_Store']
});
const workspaceManager = new WorkspaceManager();
const repositoryManager = new RepositoryManager(cacheManager, workspaceManager);

// Initialize configuration
try {
  initializeConfig();
} catch (error) {
  console.error(chalk.red('Configuration error:'), error);
  process.exit(1);
}

/**
 * Main CLI setup
 */
program
  .name('gitlab-claude-manager')
  .description('GitLab repository manager with Claude Code integration for AI-powered code analysis')
  .version('1.0.0');

/**
 * Clone command
 */
program
  .command('clone')
  .description('Clone a GitLab repository to temporary workspace')
  .argument('<repo-url>', 'GitLab repository URL')
  .option('-b, --branch <branch>', 'Branch to clone (auto-detects default if not specified)')
  .option('-d, --depth <depth>', 'Clone depth', '1')
  .option('--single-branch', 'Clone only single branch', false)
  .action(async (repoUrl: string, options) => {
    try {
      // Use branch from option only
      const targetBranch = options.branch;
      
      console.log(chalk.blue('🔄 Cloning repository...'));
      console.log(chalk.gray(`Repository: ${repoUrl}`));
      console.log(chalk.gray(`Branch: ${targetBranch || 'auto-detect'}`));
      
      // Initialize workspace manager
      const initResult = await workspaceManager.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }
      
      // Clone repository
      const cloneResult = await repositoryManager.cloneRepository(repoUrl as GitUrl, {
        branch: targetBranch,
        depth: parseInt(options.depth),
        singleBranch: !options.singleBranch
      });
      
      if (!cloneResult.success) {
        throw cloneResult.error;
      }
      
      const workspace = cloneResult.data;
      
      // Save workspace to persistent storage
      const saveResult = await workspaceManager.saveWorkspace(workspace);
      if (!saveResult.success) {
        console.log(chalk.yellow('⚠️  Warning: Failed to save workspace to persistent storage'));
      }
      
      console.log(chalk.green('✅ Repository cloned successfully!'));
      console.log(chalk.gray(`Workspace ID: ${workspace.id}`));
      console.log(chalk.gray(`Path: ${workspace.path}`));
      console.log(chalk.gray(`Commit: ${workspace.metadata?.commitHash}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Clone failed:'), error);
      process.exit(1);
    }
  });

/**
 * Analyze command
 */
program
  .command('analyze')
  .description('Analyze a workspace with Claude Code')
  .argument('<workspace-id>', 'Workspace ID to analyze')
  .option('-d, --directory <directory>', 'Directory to analyze', '.')
  .option('-l, --language <language>', 'Primary language hint')
  .action(async (workspaceId: string, options) => {
    try {
      console.log(chalk.blue('🔍 Analyzing workspace...'));
      console.log(chalk.gray(`Workspace ID: ${workspaceId}`));
      console.log(chalk.gray(`Directory: ${options.directory}`));
      
      // Initialize workspace manager
      const initResult = await workspaceManager.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }
      
      // Get workspace
      const workspaceResult = await workspaceManager.loadWorkspace(workspaceId as WorkspaceId);
      if (!workspaceResult.success) {
        throw workspaceResult.error;
      }
      
      const workspace = workspaceResult.data;
      
      // Analyze directory
      console.log(chalk.gray('📁 Scanning directory structure...'));
      const analysisResult = await cacheManager.analyzeDirectory(workspace.path);
      if (!analysisResult.success) {
        throw analysisResult.error;
      }
      
      const analysis = analysisResult.data;
      
      console.log(chalk.green('✅ Directory analysis complete!'));
      console.log(`  ${chalk.gray('Files found:')} ${analysis.fileCount}`);
      console.log(`  ${chalk.gray('Languages:')} ${analysis.languages.join(', ')}`);
      
      // Show file tree preview (first 10 items)
      if (analysis.structure.length > 0) {
        console.log(`\n${chalk.blue('📁 Directory Structure (preview):')}`);
        const preview = analysis.structure.slice(0, 10);
        for (const node of preview) {
          const icon = node.type === 'directory' ? '📁' : '📄';
          console.log(`  ${icon} ${node.name}`);
        }
        if (analysis.structure.length > 10) {
          console.log(`  ${chalk.gray('... and')} ${analysis.structure.length - 10} ${chalk.gray('more items')}`);
        }
      }
      
      // Update cache
      console.log(chalk.gray('💾 Saving analysis to cache...'));
      const currentCommitResult = await repositoryManager.getGitOperations(workspace.path).getCurrentCommitHash(workspace.path);
      if (currentCommitResult.success) {
        const setCacheResult = await cacheManager.setCache(
          workspace.path,
          analysis,
          currentCommitResult.data
        );
        
        if (setCacheResult.success) {
          console.log(chalk.green('✅ Analysis cached successfully!'));
        } else {
          console.log(chalk.yellow('⚠️  Warning: Failed to cache analysis'));
        }
      }
      
      console.log(chalk.gray('\nUse "cache-status" command to view detailed cache information.'));
      
    } catch (error) {
      console.error(chalk.red('❌ Analysis failed:'), error);
      process.exit(1);
    }
  });

/**
 * List command
 */
program
  .command('list')
  .description('List active workspaces')
  .option('-a, --all', 'Show all workspaces including inactive')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📋 Workspaces:'));
      
      // Initialize workspace manager
      const initResult = await workspaceManager.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }
      
      // Get workspaces
      const workspacesResult = await workspaceManager.getAllWorkspaces();
      if (!workspacesResult.success) {
        throw workspacesResult.error;
      }
      
      const workspaces = workspacesResult.data;
      
      if (workspaces.length === 0) {
        console.log(chalk.gray('No workspaces found. Use "clone" command to create one.'));
        return;
      }
      
      // Filter workspaces based on options
      const filteredWorkspaces = options.all 
        ? workspaces 
        : workspaces.filter(ws => ws.metadata?.isActive);
      
      if (filteredWorkspaces.length === 0) {
        console.log(chalk.gray('No active workspaces found. Use --all to see inactive workspaces.'));
        return;
      }
      
      // Display workspaces
      for (const workspace of filteredWorkspaces) {
        const status = workspace.metadata?.isActive ? chalk.green('active') : chalk.red('inactive');
        const age = ((Date.now() - workspace.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1);
        
        console.log(`${chalk.cyan(workspace.id)} [${status}]`);
        console.log(`  ${chalk.gray('Repository:')} ${workspace.repoUrl}`);
        console.log(`  ${chalk.gray('Branch:')} ${workspace.branch}`);
        console.log(`  ${chalk.gray('Path:')} ${workspace.path}`);
        console.log(`  ${chalk.gray('Last accessed:')} ${age} days ago`);
        
        if (workspace.metadata?.commitHash) {
          console.log(`  ${chalk.gray('Commit:')} ${workspace.metadata.commitHash.slice(0, 8)}`);
        }
        
        if (workspace.metadata?.size) {
          const sizeKB = (workspace.metadata.size / 1024).toFixed(1);
          console.log(`  ${chalk.gray('Size:')} ${sizeKB} KB`);
        }
        console.log('');
      }
      
    } catch (error) {
      console.error(chalk.red('❌ List failed:'), error);
      process.exit(1);
    }
  });

/**
 * Cache status command
 */
program
  .command('cache-status')
  .description('Show cache status for a workspace')
  .argument('<workspace-id>', 'Workspace ID to check')
  .action(async (workspaceId: string) => {
    try {
      console.log(chalk.blue('💾 Cache status:'));
      console.log(chalk.gray(`Workspace ID: ${workspaceId}`));
      
      // Initialize workspace manager
      const initResult = await workspaceManager.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }
      
      // Get workspace
      const workspaceResult = await workspaceManager.loadWorkspace(workspaceId as WorkspaceId);
      if (!workspaceResult.success) {
        throw workspaceResult.error;
      }
      
      const workspace = workspaceResult.data;
      
      // Check cache status
      const cacheResult = await cacheManager.getCache(workspace.path);
      if (!cacheResult.success) {
        throw cacheResult.error;
      }
      
      const cacheData = cacheResult.data;
      
      if (!cacheData) {
        console.log(chalk.red('❌ No cache found'));
        console.log(chalk.gray('Run "analyze" command to generate cache'));
        return;
      }
      
      console.log(chalk.green('✅ Cache found'));
      console.log(`  ${chalk.gray('Last updated:')} ${cacheData.lastUpdated.toLocaleString()}`);
      console.log(`  ${chalk.gray('Cache version:')} ${cacheData.version}`);
      console.log(`  ${chalk.gray('Commit hash:')} ${cacheData.lastCommitHash.slice(0, 8)}`);
      console.log(`  ${chalk.gray('Directory hash:')} ${cacheData.directoryHash.slice(0, 8)}`);
      
      if (cacheData.analysis) {
        console.log(`  ${chalk.gray('File count:')} ${cacheData.analysis.fileCount}`);
        console.log(`  ${chalk.gray('Languages:')} ${cacheData.analysis.languages.join(', ')}`);
        
        if (cacheData.analysis.aiSummary) {
          console.log(`  ${chalk.gray('AI Summary:')} ${cacheData.analysis.aiSummary.slice(0, 100)}...`);
        }
      }
      
      // Check if cache is expired or outdated
      const currentCommitResult = await repositoryManager.getGitOperations(workspace.path).getCurrentCommitHash(workspace.path);
      if (currentCommitResult.success && currentCommitResult.data !== cacheData.lastCommitHash) {
        console.log(chalk.yellow('⚠️  Cache may be outdated (commit hash changed)'));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Cache status failed:'), error);
      process.exit(1);
    }
  });

/**
 * Cleanup command
 */
program
  .command('cleanup')
  .description('Clean up workspaces')
  .argument('[workspace-id]', 'Specific workspace ID to clean (optional)')
  .option('-a, --all', 'Clean all expired workspaces')
  .option('-f, --force', 'Force cleanup without confirmation')
  .action(async (workspaceId: string | undefined, options) => {
    try {
      console.log(chalk.blue('🧹 Cleaning up workspaces...'));
      
      // Initialize workspace manager
      const initResult = await workspaceManager.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }
      
      if (workspaceId) {
        console.log(chalk.gray(`Cleaning workspace: ${workspaceId}`));
        
        // Clean specific workspace
        const cleanResult = await repositoryManager.cleanupWorkspace(workspaceId as WorkspaceId);
        if (!cleanResult.success) {
          throw cleanResult.error;
        }
        
        // Remove from persistent storage
        await workspaceManager.deleteWorkspace(workspaceId as WorkspaceId);
        
        console.log(chalk.green('✅ Workspace cleaned successfully!'));
        
      } else if (options.all) {
        console.log(chalk.gray('Cleaning ALL workspaces'));
        
        if (!options.force) {
          console.log(chalk.yellow('⚠️  This will permanently delete ALL workspaces (active and inactive).'));
          console.log(chalk.gray('Use --force to confirm, or clean specific workspaces by ID.'));
          return;
        }
        
        // Get all workspaces
        const workspacesResult = await workspaceManager.getAllWorkspaces();
        if (!workspacesResult.success) {
          throw workspacesResult.error;
        }
        
        const allWorkspaces = workspacesResult.data;
        let cleanedCount = 0;
        
        console.log(chalk.gray(`Found ${allWorkspaces.length} workspaces to clean...`));
        
        // Clean each workspace
        for (const workspace of allWorkspaces) {
          console.log(chalk.gray(`Cleaning workspace: ${workspace.id}`));
          
          const cleanResult = await repositoryManager.cleanupWorkspace(workspace.id);
          if (cleanResult.success) {
            await workspaceManager.deleteWorkspace(workspace.id);
            cleanedCount++;
            console.log(chalk.green(`  ✅ Cleaned ${workspace.id}`));
          } else {
            console.log(chalk.red(`  ❌ Failed to clean ${workspace.id}: ${cleanResult.error.message}`));
          }
        }
        
        console.log(chalk.green(`✅ Cleaned ${cleanedCount}/${allWorkspaces.length} workspaces!`));
        
      } else {
        console.log(chalk.gray('Use --all to clean all inactive workspaces, or specify a workspace ID.'));
        
        // Show workspace stats
        const statsResult = await workspaceManager.getWorkspaceStats();
        if (statsResult.success) {
          const stats = statsResult.data;
          console.log(`\n${chalk.blue('Workspace Statistics:')}`);
          console.log(`  Total: ${stats.total}`);
          console.log(`  Active: ${chalk.green(stats.active)}`);
          console.log(`  Inactive: ${chalk.red(stats.inactive)}`);
          console.log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(1)} MB`);
        }
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error);
      process.exit(1);
    }
  });

/**
 * Ask command - Natural language queries
 */
program
  .command('ask')
  .description('Ask natural language questions about a workspace')
  .argument('<workspace-id>', 'Workspace ID to query')
  .argument('<question>', 'Question to ask about the codebase')
  .option('-c, --context <context>', 'Additional context for the question')
  .action(async (workspaceId: string, question: string, options) => {
    try {
      console.log(chalk.blue('🤔 Asking Claude about your codebase...'));
      console.log(chalk.gray(`Workspace ID: ${workspaceId}`));
      console.log(chalk.gray(`Question: ${question}`));
      
      // TODO: Implement Claude Code integration
      console.log(chalk.yellow('⚠️  Claude Code integration not yet implemented'));
      
    } catch (error) {
      console.error(chalk.red('❌ Question failed:'), error);
      process.exit(1);
    }
  });

/**
 * Dev command - Development utilities
 */
program
  .command('dev')
  .description('Development utilities')
  .action(() => {
    console.log(chalk.blue('🛠️  Development Mode'));
    console.log(chalk.gray('Available commands:'));
    console.log(chalk.gray('  • clone <repo-url> --branch <branch>'));
    console.log(chalk.gray('  • analyze <workspace-id> [directory]'));
    console.log(chalk.gray('  • list [--all]'));
    console.log(chalk.gray('  • cache-status <workspace-id>'));
    console.log(chalk.gray('  • cleanup [workspace-id] [--all --force]'));
    console.log(chalk.gray('  • ask <workspace-id> "<question>"'));
    console.log('');
    console.log(chalk.green('✅ TypeScript configuration ready'));
    console.log(chalk.green('✅ Project structure created'));
    console.log(chalk.green('✅ Repository cloning implemented'));
    console.log(chalk.green('✅ Workspace management implemented'));
    console.log(chalk.green('✅ Cache management implemented'));
    console.log(chalk.yellow('⚠️  Claude Code integration pending'));
    console.log(chalk.yellow('⚠️  GitLab API integration pending'));
  });

/**
 * Error handling
 */
program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str)),
});

// Handle unknown commands
program.on('command:*', (operands) => {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log(chalk.gray('Use --help to see available commands'));
  process.exit(1);
});

// Handle no arguments
if (process.argv.length <= 2) {
  program.help();
}

// Parse command line arguments
program.parse(process.argv); 