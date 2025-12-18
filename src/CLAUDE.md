# Source Code Overview

## Directory Structure

| Directory     | Purpose                                 | Key Files                                 |
| ------------- | --------------------------------------- | ----------------------------------------- |
| `app/`        | Next.js App Router pages and API routes | `layout.tsx`, `page.tsx`, `providers.tsx` |
| `components/` | React UI components                     | See `components/CLAUDE.md`                |
| `hooks/`      | Custom React hooks for data fetching    | `useWorkspaces.ts`, `useBranches.ts`      |
| `lib/`        | Core business logic modules             | See `lib/CLAUDE.md`                       |

## Import Aliases

The `@/` alias maps to `src/` for absolute imports:

```typescript
// Good - use aliases
import { WorkspaceId } from '@/lib/types/index';
import { useWorkspaces } from '@/hooks';
import { Button } from '@heroui/button';

// Avoid - relative imports for cross-directory
import { WorkspaceId } from '../../../lib/types/index';
```

## Server vs Client Components

### Server Components (Default)

No directive needed. Can use async/await directly, access server resources:

```typescript
// src/app/dashboard/page.tsx
import { getWorkspaces } from '@/lib/workspace';

export default async function DashboardPage() {
  const workspaces = await getWorkspaces();
  return <WorkspaceList workspaces={workspaces} />;
}
```

### Client Components

Add `'use client'` at top. Required for interactivity, hooks, browser APIs:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@heroui/button';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <Button onPress={() => setCount(c => c + 1)}>{count}</Button>;
}
```

### Server Actions

Add `'use server'` for server-only functions. Can be called from client components:

```typescript
'use server';

import { revalidatePath } from 'next/cache';

export async function refreshWorkspaces() {
  // Server-side logic
  revalidatePath('/dashboard');
}
```

## File Conventions

| File          | Purpose                                   |
| ------------- | ----------------------------------------- |
| `page.tsx`    | Route page component (required for route) |
| `layout.tsx`  | Shared layout wrapper                     |
| `loading.tsx` | Loading UI (Suspense boundary)            |
| `error.tsx`   | Error boundary                            |
| `route.ts`    | API route handler                         |
| `index.ts`    | Barrel export file                        |
| `types.ts`    | Type definitions for module               |

## App Router Structure

```
src/app/
├── layout.tsx          # Root layout (providers, fonts, metadata)
├── page.tsx            # Home page (/)
├── providers.tsx       # Client-side context providers
├── globals.css         # Global styles
├── error.tsx           # Global error boundary
├── api/                # API routes (/api/*)
│   ├── ask/route.ts    # POST /api/ask
│   ├── edit/route.ts   # POST /api/edit
│   └── ...
├── dashboard/          # Dashboard pages (/dashboard)
│   ├── layout.tsx      # Dashboard layout
│   └── page.tsx        # Dashboard home
├── docs/               # Documentation pages (/docs)
│   ├── layout.tsx
│   ├── page.tsx        # Docs index
│   └── [slug]/page.tsx # Dynamic doc pages
└── signin/             # Auth pages (/signin)
    └── layout.tsx
```

## Entry Points

| File                 | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `app/layout.tsx`     | Root layout - wraps entire app with providers, fonts |
| `app/page.tsx`       | Home page component                                  |
| `app/providers.tsx`  | HeroUI, NextThemes, SessionProvider setup            |
| `instrumentation.ts` | Server startup hooks (Next.js instrumentation)       |

## Type Exports

Types are centralized and re-exported through barrels:

```typescript
// Primary type definitions
import type { WorkspaceId, GitUrl, Result } from '@/lib/types/index';

// Module-specific types via barrel
import type { GitCloneOptions, GitBranchInfo } from '@/lib/git';
import type { ClaudeCodeResult } from '@/lib/claudeCode';

// Component prop types (defined inline or co-located)
interface MyComponentProps {
  workspace: Workspace;
  onSelect: (id: WorkspaceId) => void;
}
```

## Hooks Overview

Custom hooks in `src/hooks/` encapsulate data fetching and state:

| Hook                   | Purpose              | Returns                                       |
| ---------------------- | -------------------- | --------------------------------------------- |
| `useWorkspaces`        | Fetch workspace list | `{ workspaces, loading, error, refresh }`     |
| `useEnvironmentConfig` | App configuration    | `{ config, loading, error }`                  |
| `useCloneRepository`   | Clone form state     | `{ cloneForm, setCloneForm, clone, loading }` |
| `useBranches`          | Branch listing       | `{ branches, loading, switchBranch }`         |
| `useChangePassword`    | Password form        | `{ form, setForm, submit, loading }`          |
| `useExecutionHistory`  | Claude execution log | `{ history, loading, clear }`                 |

## Common Patterns

### Async Data Fetching in Server Components

```typescript
// Server component - async is allowed
export default async function Page() {
  const result = await loadWorkspace(id);
  if (!result.success) {
    return <ErrorDisplay error={result.error} />;
  }
  return <WorkspaceView workspace={result.data} />;
}
```

### Form State in Client Components

```typescript
'use client';

import { useState } from 'react';
import { Input } from '@heroui/input';
import { Button } from '@heroui/button';

export default function MyForm() {
  const [form, setForm] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitForm(form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form>
      <Input
        value={form.name}
        onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
      />
      <Button onPress={handleSubmit} isLoading={loading}>
        Submit
      </Button>
    </form>
  );
}
```

### Error Boundaries

```typescript
// app/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```
