# Introducing Beads: A Coding Agent Memory System

## Access Note
**Medium article blocked by WebFetch (403 error).** Access directly at URL below for full content.

## Key Concepts (from source description)

### The Dementia Problem
Defines the core issue that Beads solves: coding agents lose context and experience "dementia" as conversations grow long. Traditional todo lists in markdown don't persist across context compaction.

### Context Rot
The phenomenon where agent performance degrades as context fills with historical information, reducing available space for active reasoning.

### Beads Protocol
Git-backed, graph-based memory system that:
- Externalizes agent state into structured JSONL files in `.beads/` directory
- Enables version control of agent memory
- Supports dependency graphs (not just linear lists)
- Persists across context compaction and session boundaries

### Dependency Graphs
Shift from linear todo lists to graph structures where tasks can:
- Depend on other tasks
- Block other tasks
- Be discovered during work (discovered-from relationships)
- Have priorities and hierarchies

## Technical Value for Agents

The Beads protocol solves:
1. **Context rot** - External memory doesn't consume context window
2. **Dementia problem** - Memory persists across compaction
3. **Coordination** - Multiple agents can work on shared graph
4. **Recovery** - Can resume work after any interruption using `bd ready`

**Manual Access Required:** Visit URL to read full technical manifesto with architecture details and implementation specifics.

**URL:** https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a
