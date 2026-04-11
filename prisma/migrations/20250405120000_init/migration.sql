-- CreateTable
CREATE TABLE "ralph_meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ralph_meta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ralph_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "is_archived" INTEGER NOT NULL DEFAULT 0,
    "parent_id" TEXT,
    "subtask_order" INTEGER,
    "delivery_method" TEXT DEFAULT 'merge-request',
    "execution_job_id" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "completed_at" TEXT,
    "task_number" INTEGER,
    "project_id" TEXT,
    "playbook_id" TEXT,
    "data" TEXT NOT NULL,

    CONSTRAINT "ralph_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ralph_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#6366f1',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "ralph_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ralph_playbooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "stage_ids" TEXT NOT NULL DEFAULT '[]',
    "prompt_overrides" TEXT NOT NULL DEFAULT '{}',
    "is_default" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "ralph_playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "agent_type" TEXT NOT NULL DEFAULT 'coding-agent',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT,
    "error" TEXT,
    "started_at" TEXT,
    "heartbeat_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "logs" TEXT NOT NULL DEFAULT '',
    "started_at" TEXT NOT NULL,
    "completed_at" TEXT,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "revoked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "revoked_at" TEXT,

    CONSTRAINT "stage_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "target_branch" TEXT NOT NULL,
    "provider" TEXT,
    "created_at" TEXT NOT NULL,
    "last_accessed" TEXT NOT NULL,
    "data" TEXT NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "session_id" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "is_archived" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "usage_json" TEXT,
    "duration_ms" INTEGER,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "chat_meta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "omnidev_users" (
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "two_factor" TEXT,

    CONSTRAINT "omnidev_users_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "omnidev_api_keys" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "omnidev_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ralph_tasks_task_number_key" ON "ralph_tasks"("task_number");

-- CreateIndex
CREATE INDEX "ralph_tasks_workspace_id_idx" ON "ralph_tasks"("workspace_id");

-- CreateIndex
CREATE INDEX "ralph_tasks_status_idx" ON "ralph_tasks"("status");

-- CreateIndex
CREATE INDEX "ralph_tasks_parent_id_idx" ON "ralph_tasks"("parent_id");

-- CreateIndex
CREATE INDEX "ralph_tasks_updated_at_idx" ON "ralph_tasks"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "ralph_tasks_is_archived_updated_at_idx" ON "ralph_tasks"("is_archived", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ralph_projects_name_key" ON "ralph_projects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ralph_playbooks_name_key" ON "ralph_playbooks"("name");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_task_id_idx" ON "jobs"("task_id");

-- CreateIndex
CREATE INDEX "agent_runs_job_id_idx" ON "agent_runs"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "stage_tokens_token_hash_key" ON "stage_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "stage_tokens_token_hash_idx" ON "stage_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "stage_tokens_job_id_idx" ON "stage_tokens"("job_id");

-- CreateIndex
CREATE INDEX "workspaces_last_accessed_idx" ON "workspaces"("last_accessed" DESC);

-- CreateIndex
CREATE INDEX "chat_conversations_workspace_id_updated_at_idx" ON "chat_conversations"("workspace_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at" ASC);

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

