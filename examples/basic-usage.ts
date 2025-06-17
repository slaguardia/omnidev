/**
 * Basic Usage Example for GitLab Claude Manager
 * 
 * This example demonstrates how to use the GitLab Claude Manager
 * for repository management and AI-powered code analysis.
 */

import { RepositoryManager } from '../src/managers/RepositoryManager.js';
import { CacheManager } from '../src/managers/CacheManager.js';
import { ClaudeCodeClient } from '../src/api/claudeClient.js';
import { appConfig } from '../src/config/settings.js';
import type { GitUrl, WorkspaceId } from '../src/types/index.js';

async function basicUsageExample() {
  console.log('🚀 GitLab Claude Manager - Basic Usage Example');
  console.log('================================================');

  try {
    // Initialize managers
    const cacheManager = new CacheManager({
      expiryDays: appConfig.workspace.cacheExpiryDays,
      maxCacheSize: appConfig.workspace.maxSizeMB * 1024 * 1024,
      includePatterns: ['**/*.ts', '**/*.js', '**/*.json', '**/*.md'],
      excludePatterns: ['node_modules/**', '.git/**', '.next/**']
    });

    const repositoryManager = new RepositoryManager(cacheManager);
    const claudeClient = new ClaudeCodeClient();

    // Example 1: Clone a repository
    console.log('\n📥 Example 1: Cloning Repository');
    console.log('--------------------------------');
    
    const repoUrl = 'https://gitlab.com/example/typescript-project.git' as GitUrl;
    const cloneResult = await repositoryManager.cloneRepository(repoUrl, {
      branch: 'main',
      depth: 1
    });

    if (!cloneResult.success) {
      console.error('❌ Clone failed:', cloneResult.error.message);
      return;
    }

    const workspace = cloneResult.data;
    console.log('✅ Repository cloned successfully');
    console.log(`   Workspace ID: ${workspace.id}`);
    console.log(`   Path: ${workspace.path}`);
    console.log(`   Branch: ${workspace.branch}`);

    // Example 2: Analyze directory structure
    console.log('\n🔍 Example 2: Directory Analysis');
    console.log('--------------------------------');
    
    const analysisResult = await cacheManager.analyzeDirectory(workspace.path);
    
    if (analysisResult.success) {
      const analysis = analysisResult.data;
      console.log('✅ Directory analysis completed');
      console.log(`   Files: ${analysis.fileCount}`);
      console.log(`   Languages: ${analysis.languages.join(', ')}`);
      console.log(`   Root directories: ${analysis.structure.map(s => s.name).join(', ')}`);
    }

    // Example 3: Cache management
    console.log('\n💾 Example 3: Cache Management');
    console.log('------------------------------');

    // Get current commit hash for caching
    const gitOps = repositoryManager.getGitOperations(workspace.path);
    const commitResult = await gitOps.getCurrentCommitHash(workspace.path);
    
    if (commitResult.success && analysisResult.success) {
      // Save analysis to cache
      const cacheResult = await cacheManager.setCache(
        workspace.path,
        analysisResult.data,
        commitResult.data
      );

      if (cacheResult.success) {
        console.log('✅ Analysis cached successfully');
      }

      // Retrieve from cache
      const cachedResult = await cacheManager.getCache(workspace.path);
      if (cachedResult.success && cachedResult.data) {
        console.log('✅ Cache retrieved successfully');
        console.log(`   Cache version: ${cachedResult.data.version}`);
        console.log(`   Last updated: ${cachedResult.data.lastUpdated.toISOString()}`);
      }
    }

    // Example 4: Claude Code Integration
    console.log('\n🤖 Example 4: AI Code Analysis');
    console.log('-------------------------------');

    const analysisPrompt = `
      Analyze this TypeScript project and provide:
      1. Overview of the project structure
      2. Code quality assessment
      3. Suggestions for improvement
      4. Potential security issues
    `;

    const claudeResult = await claudeClient.analyzeCode(workspace.path, analysisPrompt);
    
    if (claudeResult.success) {
      console.log('✅ AI analysis completed');
      console.log(`   Confidence: ${claudeResult.data.confidence}%`);
      console.log('\n📝 Analysis Results:');
      console.log(claudeResult.data.analysis);
      
      if (claudeResult.data.suggestions.length > 0) {
        console.log('\n💡 Suggestions:');
        claudeResult.data.suggestions.forEach((suggestion, index) => {
          console.log(`   ${index + 1}. ${suggestion}`);
        });
      }
    } else {
      console.log('⚠️  AI analysis not available (Claude Code CLI not configured)');
    }

    // Example 5: Natural Language Query
    console.log('\n❓ Example 5: Natural Language Query');
    console.log('------------------------------------');

    const question = "What are the main components of this project and how do they interact?";
    const queryResult = await claudeClient.askQuestion(workspace.id, question);
    
    if (queryResult.success) {
      console.log('✅ Question answered');
      console.log(`\nQ: ${question}`);
      console.log(`A: ${queryResult.data.answer}`);
    } else {
      console.log('⚠️  Natural language queries not available');
    }

    // Example 6: Workspace Management
    console.log('\n🗂️  Example 6: Workspace Management');
    console.log('-----------------------------------');

    // List all workspaces
    const workspaces = await repositoryManager.listWorkspaces();
    console.log(`Active workspaces: ${workspaces.length}`);
    
    workspaces.forEach((ws, index) => {
      console.log(`   ${index + 1}. ${ws.id} - ${ws.repoUrl} (${ws.branch})`);
    });

    // Clean up workspace
    const cleanupResult = await repositoryManager.cleanupWorkspace(workspace.id);
    if (cleanupResult.success) {
      console.log('✅ Workspace cleaned up successfully');
    }

  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
}

/**
 * Advanced usage example with error handling and best practices
 */
async function advancedUsageExample() {
  console.log('\n🔬 Advanced Usage Example');
  console.log('=========================');

  const cacheManager = new CacheManager({
    expiryDays: 7,
    maxCacheSize: 500 * 1024 * 1024, // 500MB
    includePatterns: ['**/*.{ts,js,jsx,tsx,json,md,yml,yaml}'],
    excludePatterns: ['**/node_modules/**', '**/.git/**', '**/.next/**']
  });

  const repositoryManager = new RepositoryManager(cacheManager);

  try {
    // Clone multiple repositories concurrently
    const repositories = [
      'https://gitlab.com/example/frontend-app.git',
      'https://gitlab.com/example/backend-api.git',
      'https://gitlab.com/example/shared-components.git'
    ] as GitUrl[];

    console.log('📥 Cloning multiple repositories...');
    
    const clonePromises = repositories.map(repo => 
      repositoryManager.cloneRepository(repo, { depth: 1 })
    );

    const results = await Promise.allSettled(clonePromises);
    const successfulClones = results
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value.success
      )
      .map(result => result.value.data);

    console.log(`✅ Successfully cloned ${successfulClones.length}/${repositories.length} repositories`);

    // Analyze all workspaces concurrently
    console.log('\n🔍 Analyzing all workspaces...');
    
    const analysisPromises = successfulClones.map(workspace =>
      cacheManager.analyzeDirectory(workspace.path)
    );

    const analysisResults = await Promise.allSettled(analysisPromises);
    const successfulAnalyses = analysisResults
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value.success
      );

    console.log(`✅ Successfully analyzed ${successfulAnalyses.length} workspaces`);

    // Generate comprehensive report
    console.log('\n📊 Generating Comprehensive Report');
    console.log('----------------------------------');

    const report = {
      totalWorkspaces: successfulClones.length,
      totalFiles: 0,
      languages: new Set<string>(),
      frameworks: new Set<string>(),
      issues: [] as string[]
    };

    successfulAnalyses.forEach(result => {
      const analysis = result.value.data;
      report.totalFiles += analysis.fileCount;
      analysis.languages.forEach(lang => report.languages.add(lang));
    });

    console.log(`Total files analyzed: ${report.totalFiles}`);
    console.log(`Languages detected: ${Array.from(report.languages).join(', ')}`);

    // Cleanup all workspaces
    console.log('\n🧹 Cleaning up workspaces...');
    
    const cleanupPromises = successfulClones.map(workspace =>
      repositoryManager.cleanupWorkspace(workspace.id)
    );

    await Promise.allSettled(cleanupPromises);
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Advanced example failed:', error);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🎯 Running GitLab Claude Manager Examples\n');
  
  basicUsageExample()
    .then(() => advancedUsageExample())
    .then(() => {
      console.log('\n🎉 All examples completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Configure your .env file with GitLab and Claude credentials');
      console.log('2. Install Claude Code CLI for AI features');
      console.log('3. Run: npm run dev -- clone <your-repo-url>');
      console.log('4. Run: npm run dev -- analyze <workspace-id>');
    })
    .catch(error => {
      console.error('\n💥 Example execution failed:', error);
      process.exit(1);
    });
}

export { basicUsageExample, advancedUsageExample }; 