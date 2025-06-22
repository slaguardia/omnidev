import { spawn } from "child_process";
import { promises as fs } from "fs";

/**
 * Standalone Claude CLI Test
 * 
 * This file isolates and tests the Claude CLI execution logic
 * from your claudeCodeIntegration.ts file.
 */

// Test scenarios
const testCases = [
  {
    name: "Version Check",
    question: null,
    isEditRequest: false,
    options: { workingDirectory: process.cwd() }
  },
  {
    name: "Simple Read-Only Question",
    question: "What files are in this directory?",
    isEditRequest: false,
    options: { workingDirectory: process.cwd() }
  },
  {
    name: "Edit Request (with permissions)",
    question: "Please create a new file called test-claude-output.txt with 'Hello from Claude CLI test'",
    isEditRequest: true,
    options: { workingDirectory: process.cwd(), context: "Test context data" }
  },
  {
    name: "File Analysis",
    question: "Please analyze the package.json file and tell me what type of project this is",
    isEditRequest: false,
    options: { workingDirectory: process.cwd() }
  },
  {
    name: "Error Handling Test",
    question: "Please read a file that doesn't exist: nonexistent-file-12345.txt",
    isEditRequest: false,
    options: { workingDirectory: process.cwd() }
  },
  {
    name: "Long Input Test",
    question: "This is a very long question that should test how the system handles longer inputs. ".repeat(10),
    isEditRequest: false,
    options: { workingDirectory: process.cwd() }
  }
];

/**
 * Check if a request needs edit permissions (simplified version)
 */
function isEditRequest(question) {
  if (!question) return false;
  const editKeywords = ['create', 'edit', 'modify', 'delete', 'write', 'update', 'add', 'remove'];
  return editKeywords.some(keyword => question.toLowerCase().includes(keyword));
}

// Configuration
const useDebugOutput = process.env.CLAUDE_DEBUG !== 'false'; // Set CLAUDE_DEBUG=false to disable debug output

/**
 * Execute Claude CLI command (extracted from claudeCodeIntegration.ts)
 */
async function testClaudeExecution(testCase) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);

    // Handle version check differently
    if (!testCase.question) {
      const versionCmd = useDebugOutput ? ['--debug', '--version'] : ['--version'];
      console.log(`[CLAUDE CLI] Running version check: claude ${versionCmd.join(' ')}`);
      
      const versionProcess = spawn('claude', versionCmd, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        cwd: testCase.options.workingDirectory,
        env: {
          ...process.env,
          TERM: 'dumb',
          NO_COLOR: '1'
        }
      });

      let output = '';
      let stderr = '';

      versionProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      versionProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      versionProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        console.log(`[CLAUDE CLI] Version check completed in ${executionTime}ms`);
        console.log(`[CLAUDE CLI] Exit code: ${code}`);
        if (output.trim()) console.log(`[CLAUDE CLI] Output: ${output.trim()}`);
        if (stderr.trim()) console.log(`[CLAUDE CLI] Stderr: ${stderr.trim()}`);
        resolve({ success: code === 0, executionTime, output, stderr });
      });

      versionProcess.on('error', (error) => {
        const executionTime = Date.now() - startTime;
        console.error(`[CLAUDE CLI] Error: ${error.message}`);
        resolve({ success: false, executionTime, error: error.message });
      });

      return;
    }

    // Build command for actual questions (matches your production logic)
    const baseCommand = useDebugOutput ? 'claude --debug' : 'claude';
    const needsPermissions = testCase.isEditRequest;
    const skipPermissionsFlag = needsPermissions ? ' --dangerously-skip-permissions' : '';
    
    // Build the full input
    let fullInput = testCase.question;
    if (testCase.options.context) {
      fullInput += `\n\nContext: ${testCase.options.context}`;
    }
    if (needsPermissions) {
      fullInput += '\n\nIMPORTANT: Only work within the current workspace directory. Do not access files outside this workspace.';
    }
    
    // No special completion instructions needed - Claude CLI terminates naturally
    
    // Construct the command (matches your production code)
    const command = `${baseCommand}${skipPermissionsFlag} -p "${fullInput.replace(/"/g, '\\"')}"`;
    
    // Set timeout duration based on request type
    const timeout = needsPermissions ? 300000 : 120000; // 5 minutes for edits, 2 minutes for reads
    
    // Cleaned up logging (matches your updated code)
    console.log(`[CLAUDE CLI] 🚀 Executing: ${command}`);
    console.log(`[CLAUDE CLI] Input: ${fullInput.length} chars, ${needsPermissions ? 'edit' : 'read-only'} mode, ${timeout/1000}s timeout`);
    
    if (fullInput.length > 200) {
      console.log(`[CLAUDE CLI] Input preview: ${fullInput.substring(0, 200)}...`);
    } else {
      console.log(`[CLAUDE CLI] Input: ${fullInput}`);
    }

    // Execute Claude CLI (matches your production spawn configuration)
    const claudeProcess = spawn(command, {
      cwd: testCase.options.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe'], // Changed stdin from 'pipe' to 'ignore'
      shell: true,
      env: {
        ...process.env,
        TERM: 'dumb',
        NO_COLOR: '1'
      }
    });

    // Close stdin immediately to prevent hanging
    if (claudeProcess.stdin) {
      claudeProcess.stdin.end();
    }

    let stdout = '';
    let stderr = '';
    let stdoutChunks = 0;
    let stderrChunks = 0;

    // Capture stdout
    claudeProcess.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      stdoutChunks++;
      console.log(`[CLAUDE CLI] 📥 stdout chunk ${stdoutChunks} (${chunk.length} chars)`);
    });

    // Capture stderr
    claudeProcess.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      stderrChunks++;
      console.log(`[CLAUDE CLI] ⚠️ stderr chunk ${stderrChunks} (${chunk.length} chars)`);
    });

    claudeProcess.on('close', (code) => {
      const executionTime = Date.now() - startTime;
      
      console.log(`[CLAUDE CLI] 🏁 Process closed after ${executionTime}ms`);
      console.log(`[CLAUDE CLI] Exit code: ${code}, stdout: ${stdout.length} chars, stderr: ${stderr.length} chars`);
      
      if (stdout.trim()) {
        const preview = stdout.length > 1000 ? stdout.substring(0, 1000) + '...' : stdout;
        console.log(`[CLAUDE CLI] ✅ Output: ${preview}`);
      }
      
      if (stderr.trim()) {
        console.log(`[CLAUDE CLI] ⚠️ Stderr: ${stderr.trim()}`);
      }
      
      resolve({
        success: code === 0,
        executionTime,
        output: stdout,
        stderr,
        exitCode: code
      });
    });

    claudeProcess.on('error', (error) => {
      const executionTime = Date.now() - startTime;
      console.error(`[CLAUDE CLI] ❌ Process error: ${error.message}`);
      resolve({
        success: false,
        executionTime,
        error: error.message
      });
    });

    // Simple timeout handling - fallback only
    const timeoutHandle = setTimeout(() => {
      if (!claudeProcess.killed) {
        console.log(`[CLAUDE CLI] ⏰ Timeout after ${timeout/1000}s - killing process`);
        claudeProcess.kill('SIGKILL');
      }
    }, timeout);
    
    // Clear timeout when process completes naturally
    claudeProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}

/**
 * Clean up test files
 */
async function cleanupTestFiles() {
  const testFiles = ['test-claude-output.txt', 'test.txt'];
  
  for (const file of testFiles) {
    try {
      await fs.unlink(file);
      console.log(`🧹 Cleaned up: ${file}`);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }
}

/**
 * Verify file creation
 */
async function verifyFileCreation(filename) {
  try {
    const content = await fs.readFile(filename, 'utf8');
    console.log(`✅ File verified: ${filename} (${content.length} chars)`);
    return true;
  } catch (error) {
    console.log(`❌ File verification failed: ${filename}`);
    return false;
  }
}

/**
 * Run all test cases
 */
async function runAllTests() {
  console.log(`🚀 Claude CLI Test Suite Started at ${new Date().toISOString()}`);
  console.log(`📁 Working directory: ${process.cwd()}`);
  console.log(`📋 Running ${testCases.length} test cases\n`);

  const results = [];
  let totalTime = 0;

  for (const testCase of testCases) {
    try {
      const result = await testClaudeExecution(testCase);
      results.push({ testCase: testCase.name, ...result });
      totalTime += result.executionTime || 0;
      
      // Verify file creation for edit tests
      if (testCase.isEditRequest && result.success) {
        const fileVerified = await verifyFileCreation('test-claude-output.txt');
        if (!fileVerified) {
          result.success = false;
          result.error = 'File creation verification failed';
        }
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Test "${testCase.name}" threw error:`, error);
      results.push({ testCase: testCase.name, success: false, error: error.message });
    }
  }

  // Cleanup test files
  await cleanupTestFiles();

  // Summary
  console.log(`\n📊 Test Results Summary:`);
  console.log(`═══════════════════════════════════════`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  const avgTime = totalTime / results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const time = result.executionTime ? `(${result.executionTime}ms)` : '';
    console.log(`${status} ${result.testCase} ${time}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log(`\n🎯 Total: ${results.length}, Passed: ${successful}, Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalTime}ms, Average: ${Math.round(avgTime)}ms per test`);
  console.log(`⏰ Test suite completed at ${new Date().toISOString()}`);
  
  // Exit with appropriate code
  const exitCode = failed > 0 ? 1 : 0;
  console.log(`\n🚪 Exiting with code ${exitCode}`);
  process.exit(exitCode);
}

// Fix the function name typo
async function testClaudeExecutionFixed(testCase) {
  return testClaudeExecution(testCase);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚡ Received SIGINT, cleaning up...');
  await cleanupTestFiles();
  console.log('🚪 Exiting gracefully');
  process.exit(130); // Standard exit code for SIGINT
});

process.on('SIGTERM', async () => {
  console.log('\n\n⚡ Received SIGTERM, cleaning up...');
  await cleanupTestFiles();
  console.log('🚪 Exiting gracefully');
  process.exit(143); // Standard exit code for SIGTERM
});

// Run specific test or all tests based on command line args
if (process.argv.length > 2) {
  const testName = process.argv[2];
  const testCase = testCases.find(tc => tc.name.toLowerCase().includes(testName.toLowerCase()));
  
  if (testCase) {
    console.log(`🎯 Running specific test: ${testCase.name}`);
    testClaudeExecutionFixed(testCase)
      .then(async result => {
        console.log(`\n${result.success ? '✅ Success' : '❌ Failed'} in ${result.executionTime}ms`);
        
        // Verify file creation for edit tests
        if (testCase.isEditRequest && result.success) {
          const fileVerified = await verifyFileCreation('test-claude-output.txt');
          if (!fileVerified) {
            result.success = false;
            console.log('❌ File creation verification failed');
          }
        }
        
        // Cleanup and exit
        await cleanupTestFiles();
        const exitCode = result.success ? 0 : 1;
        console.log(`🚪 Exiting with code ${exitCode}`);
        process.exit(exitCode);
      })
      .catch(async error => {
        console.error(`❌ Test execution error:`, error);
        await cleanupTestFiles();
        console.log('🚪 Exiting with code 1');
        process.exit(1);
      });
  } else {
    console.log(`❌ Test "${testName}" not found. Available tests:`);
    testCases.forEach(tc => console.log(`  - ${tc.name}`));
    console.log('🚪 Exiting with code 1');
    process.exit(1);
  }
} else {
  runAllTests().catch(async error => {
    console.error('❌ Test suite error:', error);
    await cleanupTestFiles();
    console.log('🚪 Exiting with code 1');
    process.exit(1);
  });
} 