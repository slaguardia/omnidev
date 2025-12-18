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
        description: 'Get up and running with Workflow in minutes',
        file: 'QUICKSTART.md',
      },
      {
        title: 'Environment Setup',
        slug: 'environment',
        description: 'Configure your environment variables and settings',
        file: 'ENVIRONMENT.md',
      },
      {
        title: 'Docker Setup',
        slug: 'docker',
        description: 'Deploy using Docker and Docker Compose',
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
        description: 'Understanding the Claude Code sandbox security model',
        file: 'SANDBOX_ARCHITECTURE.md',
      },
      {
        title: 'Sandbox Quick Reference',
        slug: 'sandbox-quick-reference',
        description: 'Quick guide to sandbox features and testing',
        file: 'SANDBOX_QUICK_REFERENCE.md',
      },
      {
        title: 'Credentials Management',
        slug: 'credentials',
        description: 'Secure credential storage and management',
        file: 'CREDENTIALS.md',
      },
      {
        title: 'Password Reset',
        slug: 'password-reset',
        description: 'How to reset your password if locked out',
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
        description: 'API routes, request queue, and response handling',
        file: 'API_OPERATIONS.md',
      },
      {
        title: 'API Authentication',
        slug: 'api-authentication',
        description: 'Authentication methods and security configuration',
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
        description: 'Automate GitLab merge requests with Claude Code',
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
        description: 'Automate task processing with n8n integration',
        file: 'N8N_WORKFLOWS.md',
      },
      {
        title: 'Prompt Templates',
        slug: 'prompt-templates',
        description: 'Reusable prompt templates for planning and development',
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
