# Omnidev — Internal Specification

> These documents are internal engineering specifications. They are NOT served on the UI
> and are NOT user-facing documentation. They describe the system as-built, the target
> architecture, and the evolution plan.

## Documents

| Document                               | Purpose                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Comprehensive inventory of what exists today — data models, execution engine, UI, APIs |
| [ARCHITECTURE.md](./ARCHITECTURE.md)   | System architecture as-built — layers, data flows, concurrency model                   |
| [VISION.md](./VISION.md)               | North star: spec-driven development — principles, levels, user experience model        |
| [GAPS.md](./GAPS.md)                   | Identified gaps and improvements, organized by severity and impact                     |
| [ROADMAP.md](./ROADMAP.md)             | Phased evolution plan from current state to north star                                 |

## How to Use These Documents

- **Before starting work:** Read VISION.md to understand the target. Read GAPS.md to see what's missing.
- **During implementation:** Reference CURRENT_STATE.md and ARCHITECTURE.md for how things work today.
- **When planning:** Use ROADMAP.md to understand sequencing and dependencies between improvements.

## Maintenance

These documents should be updated as the system evolves:

- When a gap is addressed, update GAPS.md and CURRENT_STATE.md
- When architecture changes significantly, update ARCHITECTURE.md
- When the roadmap shifts, update ROADMAP.md with rationale

Last reviewed: 2026-03-11
