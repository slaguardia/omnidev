-- Per-run summary fields on agent_runs populated by the streaming AgentRunner.
ALTER TABLE "agent_runs" ADD COLUMN "model" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "input_tokens" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "output_tokens" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "total_tokens" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "cost_cents" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "cancellation_requested_at" TEXT;

-- Row-per-event timeline emitted by an AgentRunner during a single run.
-- seq is monotonic per-run (not global) so concurrent runs do not contend
-- on a global sequence; the unique constraint on (run_id, seq) catches any
-- application-side bug that produces duplicates within one run.
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- Ordered read by run; primary access path for the SSE timeline endpoint.
CREATE INDEX "agent_events_run_id_seq_idx" ON "agent_events" ("run_id", "seq");

-- Filtered read by event type (e.g. only tool_call events).
CREATE INDEX "agent_events_run_id_type_idx" ON "agent_events" ("run_id", "type");

-- Application-level invariant: seq is unique per run.
CREATE UNIQUE INDEX "agent_events_run_id_seq_unique" ON "agent_events" ("run_id", "seq");

-- ON DELETE CASCADE so deleting a run removes its events. Mirrors the
-- existing agent_runs -> jobs cascade.
ALTER TABLE "agent_events"
    ADD CONSTRAINT "agent_events_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
