/**
 * Documentation Configuration
 *
 * This file defines the structure and navigation for the documentation site.
 */

export interface DocPage {
  title: string;
  slug: string;
  description?: string;
  file: string; // Path relative to /docs
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const docsConfig: DocSection[] = [
  {
    title: 'Getting Started',
    pages: [
      {
        title: 'Quick Start',
        slug: 'quickstart',
        description:
          'Get started with Omnidev in minutes. Install, configure, and run your first AI-powered code task.',
        file: 'QUICKSTART.md',
      },
      {
        title: 'Environment Setup',
        slug: 'environment',
        description:
          'Configure environment variables for Omnidev. Set up API keys, authentication, and GitLab/GitHub integration.',
        file: 'ENVIRONMENT.md',
      },
      {
        title: 'Docker Setup',
        slug: 'docker',
        description:
          'Deploy Omnidev with Docker and Docker Compose. Self-host your AI developer bot with containerized security.',
        file: 'DOCKER.md',
      },
    ],
  },
  {
    title: 'Security',
    pages: [
      {
        title: 'Sandbox Architecture',
        slug: 'sandbox-architecture',
        description:
          'Learn how Omnidev sandboxes Claude Code execution. Secure git blocking, PATH restrictions, and isolation.',
        file: 'SANDBOX_ARCHITECTURE.md',
      },
      {
        title: 'Sandbox Quick Reference',
        slug: 'sandbox-quick-reference',
        description:
          'Quick reference for sandbox features. Test and verify security measures in your Omnidev deployment.',
        file: 'SANDBOX_QUICK_REFERENCE.md',
      },
      {
        title: 'Credentials Management',
        slug: 'credentials',
        description:
          'Securely manage API keys and tokens in Omnidev. Store GitLab, GitHub, and Anthropic credentials safely.',
        file: 'CREDENTIALS.md',
      },
      {
        title: 'Password Reset',
        slug: 'password-reset',
        description:
          'Reset your Omnidev password if locked out. Step-by-step recovery instructions.',
        file: 'PASSWORD_RESET.md',
      },
    ],
  },
  {
    title: 'API',
    pages: [
      {
        title: 'API Operations',
        slug: 'api-operations',
        description:
          'Omnidev REST API reference. Queue code tasks, check job status, and handle async responses.',
        file: 'API_OPERATIONS.md',
      },
      {
        title: 'API Authentication',
        slug: 'api-authentication',
        description:
          'Authenticate with Omnidev API. Use API keys, session tokens, and configure IP whitelisting.',
        file: 'API_AUTHENTICATION.md',
      },
    ],
  },
  {
    title: 'Features',
    pages: [
      {
        title: 'Merge Request Automation',
        slug: 'merge-request-automation',
        description:
          'Automate GitLab merge requests and GitHub pull requests. AI-generated branches, commits, and descriptions.',
        file: 'MERGE_REQUEST_AUTOMATION.md',
      },
    ],
  },
  {
    title: 'Integrations',
    pages: [
      {
        title: 'n8n Workflows',
        slug: 'n8n-workflows',
        description:
          'Connect Omnidev to n8n for workflow automation. Trigger code tasks from any n8n workflow.',
        file: 'N8N_WORKFLOWS.md',
      },
      {
        title: 'n8n Templates',
        slug: 'n8n-templates',
        description:
          'Ready-to-import n8n templates for Omnidev. HTTP nodes, webhook handlers, and complete automation flows.',
        file: 'N8N_TEMPLATES.md',
      },
      {
        title: 'n8n Async Patterns',
        slug: 'n8n-async-patterns',
        description:
          'Handle async job queues in n8n workflows. Polling patterns and webhook-based completion handling.',
        file: 'N8N_ASYNC_PATTERNS.md',
      },
      {
        title: 'Prompt Templates',
        slug: 'prompt-templates',
        description:
          'Reusable AI prompt templates for code analysis, planning, and automated development tasks.',
        file: 'PROMPT_TEMPLATES.md',
      },
    ],
  },
];

/**
 * Get all doc pages flattened
 */
export function getAllDocs(): DocPage[] {
  return docsConfig.flatMap((section) => section.pages);
}

/**
 * Get a specific doc by slug
 */
export function getDocBySlug(slug: string): DocPage | undefined {
  return getAllDocs().find((doc) => doc.slug === slug);
}

/**
 * Get the next and previous docs for navigation
 */
export function getAdjacentDocs(slug: string): {
  prev: DocPage | undefined;
  next: DocPage | undefined;
} {
  const allDocs = getAllDocs();
  const currentIndex = allDocs.findIndex((doc) => doc.slug === slug);

  if (currentIndex === -1) {
    return { prev: undefined, next: undefined };
  }

  return {
    prev: currentIndex > 0 ? allDocs[currentIndex - 1] : undefined,
    next: currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : undefined,
  };
}
