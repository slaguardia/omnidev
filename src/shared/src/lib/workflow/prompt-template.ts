/**
 * Prompt template resolution for workflow stage execution.
 * Shared utility for client (modal preview) and server (job execution).
 */

export interface PromptTemplateVariables {
  title: string;
  description: string | null;
  filePaths: string[];
  /** Output from the immediately preceding stage (last iteration) */
  previousStageOutput?: string | null;
  /** All stage outputs keyed by stage name (last iteration output for each) */
  stageOutputs?: Record<string, string>;
  /** Path to the stage artifact file, e.g. .ralph/tasks/{taskId}/{stageName}.md */
  artifactPath?: string | null;
}

/**
 * Resolve a prompt template by substituting {variable} placeholders.
 * Lines where the variable resolves to empty/null are stripped entirely.
 *
 * When `returnQuestions` is true, a standard instruction block is appended
 * asking Claude to list questions in a parseable format.
 */
export function resolvePromptTemplate(
  template: string,
  vars: PromptTemplateVariables,
  returnQuestions = false
): string {
  const replacements: Record<string, string> = {
    title: vars.title,
    description: vars.description ?? '',
    // Legacy alias: {prompt} resolves to the same value as {description}
    prompt: vars.description ?? '',
    filePaths: vars.filePaths.length > 0 ? vars.filePaths.map((f) => `- ${f}`).join('\n') : '',
    previousStageOutput: vars.previousStageOutput ?? '',
    artifactPath: vars.artifactPath ?? '',
  };

  const lines = template.split('\n');
  const resolvedLines: string[] = [];

  for (const line of lines) {
    // Check if this line contains any template variables
    const variablesInLine: string[] = [];
    // Match both {variable} and {stageOutput:stageName} patterns
    const replaced = line.replace(
      /\{(\w+)(?::(\w[\w-]*))?\}/g,
      (_match, key: string, param?: string) => {
        if (key === 'stageOutput' && param && vars.stageOutputs) {
          variablesInLine.push(`stageOutput:${param}`);
          return vars.stageOutputs[param] ?? '';
        }
        variablesInLine.push(key);
        return replacements[key] ?? '';
      }
    );

    // If the line had template variables and ALL resolved to empty, skip the line
    if (variablesInLine.length > 0) {
      const allEmpty = variablesInLine.every((key) => {
        if (key.startsWith('stageOutput:')) {
          const stageName = key.slice('stageOutput:'.length);
          return !vars.stageOutputs?.[stageName];
        }
        return !replacements[key];
      });
      if (allEmpty) {
        continue;
      }
    }

    resolvedLines.push(replaced);
  }

  let result = resolvedLines.join('\n').trim();

  if (returnQuestions) {
    result +=
      '\n\n---\n\n## Questions\n\n' +
      'If you need clarification from the user before you can proceed, call the ' +
      '**request_clarification** tool. Pass each question as a separate string in ' +
      'the `questions` array. The stage pauses immediately and the questions are ' +
      'surfaced to the human reviewer.';
  }

  return result;
}

/**
 * @deprecated Question detection now flows through the request_clarification
 * MCP tool exposed by mcp-signals-server.ts. The agent calls the tool with a
 * structured `questions` array; agent-runner.ts reads the args directly off
 * the tool_call event in the AgentEvent stream. This function is retained
 * only for backward-compat with any external test fixtures that still
 * import it; it has no production callers.
 */
export function parseQuestionsFromOutput(output: string): string[] {
  const questions: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*QUESTION:\s*(.+)/i);
    if (match && match[1]) {
      questions.push(match[1].trim());
    }
  }

  return questions;
}
