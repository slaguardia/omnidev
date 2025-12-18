# UI Components

React components built on HeroUI (formerly NextUI) with Tailwind CSS.

## Directory Structure

| Directory         | Purpose                              |
| ----------------- | ------------------------------------ |
| `dashboard/`      | Dashboard page components and modals |
| `dashboard/tabs/` | Tab panel content components         |
| `docs/`           | Documentation page components        |
| Root files        | Shared/global components             |

## Component Inventory

### Root Components

| Component         | Purpose                             |
| ----------------- | ----------------------------------- |
| `NavBar.tsx`      | Main navigation bar                 |
| `SearchModal.tsx` | Global search modal                 |
| `ThemeSwitch.tsx` | Dark/light mode toggle              |
| `Counter.tsx`     | Simple counter demo                 |
| `Icons.tsx`       | Custom icon components              |
| `Primitives.ts`   | Shared Tailwind variant definitions |

### Dashboard Components

| Component                     | Purpose                    |
| ----------------------------- | -------------------------- |
| `CloneRepositoryModal.tsx`    | Clone git repo form modal  |
| `ConfigurationStatus.tsx`     | Config status display      |
| `ChangePasswordModal.tsx`     | Password change form       |
| `ConfirmClearApiKeyModal.tsx` | API key clear confirmation |
| `DashboardNavigation.tsx`     | Dashboard tab navigation   |
| `Enable2FAModal.tsx`          | 2FA setup with QR code     |
| `Disable2FAModal.tsx`         | 2FA disable confirmation   |

### Dashboard Tab Components

| Component                 | Purpose                          |
| ------------------------- | -------------------------------- |
| `WorkspacesTab.tsx`       | Workspace listing and management |
| `OperationsTab.tsx`       | Claude Code operations interface |
| `SettingsTab.tsx`         | App settings configuration       |
| `GitSourceConfigTab.tsx`  | Git source configuration         |
| `AccountSecurityTab.tsx`  | 2FA and password settings        |
| `ExecutionHistoryTab.tsx` | Claude execution log viewer      |
| `QueueTab.tsx`            | Job queue status and management  |

### Documentation Components

| Component              | Purpose                    |
| ---------------------- | -------------------------- |
| `DocsNavigation.tsx`   | Docs sidebar navigation    |
| `MarkdownRenderer.tsx` | Markdown to React renderer |
| `TableOfContents.tsx`  | Auto-generated TOC         |

## Component Patterns

### Client Component Declaration

All interactive components must use `'use client'`:

```typescript
'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';

export default function MyComponent() {
  const [state, setState] = useState(false);
  return <Button onPress={() => setState(!state)}>Toggle</Button>;
}
```

### HeroUI Component Imports

Import from specific packages (not from `@heroui/react`):

```typescript
// Correct - specific package imports
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Card, CardHeader, CardBody, CardFooter } from '@heroui/card';
import { Tooltip } from '@heroui/tooltip';
import { Switch } from '@heroui/switch';
import { Select, SelectItem } from '@heroui/select';
import { Chip } from '@heroui/chip';
import { Divider } from '@heroui/divider';
import { Snippet } from '@heroui/snippet';
import { Code } from '@heroui/code';

// Icons from lucide-react
import { GitBranch, Info, AlertCircle, Check, X, Copy, Settings } from 'lucide-react';
```

### Modal Component Pattern

Standard modal structure with form handling:

```typescript
'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';

interface MyModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => Promise<void>;
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  loading: boolean;
}

export default function MyModal({
  isOpen,
  onOpenChange,
  onSubmit,
  formData,
  setFormData,
  loading,
}: MyModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: 'dark:bg-slate-800/80 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold">Modal Title</h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Input
                  label="Field Name"
                  placeholder="Enter value"
                  value={formData.field}
                  onChange={(e) => setFormData(prev => ({ ...prev, field: e.target.value }))}
                  variant="bordered"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button color="primary" onPress={onSubmit} isLoading={loading}>
                Submit
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
```

### Tab Component Pattern

Tab panels receive data via props from the parent:

```typescript
'use client';

import React from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import type { Workspace } from '@/lib/dashboard/types';

interface WorkspacesTabProps {
  workspaces: Workspace[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (workspace: Workspace) => void;
}

export default function WorkspacesTab({
  workspaces,
  loading,
  onRefresh,
  onSelect,
}: WorkspacesTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Workspaces</h2>
        <Button onPress={onRefresh} isLoading={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {workspaces.map((workspace) => (
          <Card
            key={workspace.id}
            isPressable
            onPress={() => onSelect(workspace)}
          >
            <CardHeader>{workspace.repoUrl}</CardHeader>
            <CardBody>Branch: {workspace.targetBranch}</CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### Dark Mode Styling

Use Tailwind's dark mode variants:

```typescript
<div className="dark:bg-slate-800 bg-white">
  <p className="dark:text-white text-gray-900">
    Content that adapts to theme
  </p>
  <span className="dark:text-gray-400 text-gray-600">
    Secondary text
  </span>
</div>
```

## Custom Hooks

Hooks in `src/hooks/` encapsulate state and data fetching:

### Hook Pattern

```typescript
import { useState, useEffect } from 'react';

export const useMyData = () => {
  const [data, setData] = useState<Data[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadData();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error, refresh: fetchData };
};
```

### Available Hooks

| Hook                   | Returns                                                           | Usage                     |
| ---------------------- | ----------------------------------------------------------------- | ------------------------- |
| `useWorkspaces`        | `{ workspaces, loading, loadWorkspaces, handleCleanupWorkspace }` | Workspace list management |
| `useEnvironmentConfig` | `{ config, loading, error }`                                      | App configuration         |
| `useCloneRepository`   | `{ cloneForm, setCloneForm, handleClone, loading }`               | Repo cloning              |
| `useBranches`          | `{ branches, loading, currentBranch, switchBranch }`              | Branch operations         |
| `useChangePassword`    | `{ form, setForm, handleSubmit, loading, error }`                 | Password form             |
| `useExecutionHistory`  | `{ history, loading, clearHistory }`                              | Execution logs            |

### Using Hooks in Components

```typescript
'use client';

import { useWorkspaces } from '@/hooks';
import { Spinner } from '@heroui/spinner';

export default function WorkspaceList() {
  const { workspaces, loading, loadWorkspaces } = useWorkspaces();

  if (loading) return <Spinner />;

  return (
    <div>
      {workspaces.map(ws => (
        <div key={ws.id}>{ws.repoUrl}</div>
      ))}
      <button onClick={loadWorkspaces}>Refresh</button>
    </div>
  );
}
```

## Barrel Exports

Components exported via `index.ts` files:

```typescript
// components/dashboard/index.ts
export { default as CloneRepositoryModal } from '@/components/dashboard/CloneRepositoryModal';
export { default as ConfigurationStatus } from '@/components/dashboard/ConfigurationStatus';
export { DashboardNavigation } from '@/components/dashboard/DashboardNavigation';
export * from '@/components/dashboard/tabs';

// Usage
import { CloneRepositoryModal, WorkspacesTab } from '@/components/dashboard';
```

## Adding New Components

1. Create file in appropriate directory
2. Add `'use client'` if interactive
3. Import HeroUI components from specific packages
4. Use consistent prop interface patterns
5. Export via barrel `index.ts`
6. Use Tailwind dark mode variants for theming
