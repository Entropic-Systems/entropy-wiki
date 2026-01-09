# Google ADK: Core Architectural Concepts

## 1. Compiled View Concept

Google's ADK treats **context as a derived representation rather than mutable storage**. The framework separates concerns into layers:

- **Sources**: Sessions, memory, and artifacts contain full structured state
- **Compiler pipeline**: Flows and processors transform that state through ordered passes
- **Output**: Working context is the ephemeral projection sent to the LLM

As the article states: *"Context is a compiled view over a richer stateful system."* This shift reframes context management from prompt engineering into systems architecture, where you ask questions about intermediate representations, compaction points, and transformation observability.

## 2. Handle Pattern for Artifacts

Rather than embedding large data (5MB CSVs, PDFs, JSON responses) directly in prompts, ADK uses **indirect references**:

- Large objects live in an `ArtifactService` as named, versioned resources
- Agents see lightweight summaries by default
- The `LoadArtifactsTool` allows agents to fetch full content *on-demand*
- After task completion, artifacts are offloaded from context

This prevents permanent context tax: *"The data can be huge, but the context window remains lean."*

## 3. Multi-Agent Architecture

ADK defines two interaction patterns:

**Agents as Tools**: Specialized sub-agents receive focused prompts only—no ancestral history flooding the call.

**Agent Transfer/Hierarchy**: Control passes to a sub-agent with configurable scope via parameters like `include_contents`, determining how much caller context flows downstream.

A critical feature: during handoff, ADK **reframes conversations** so the receiving agent doesn't confuse prior assistant messages with its own actions, maintaining attribution clarity across agent boundaries.

**Technical Value for Agents:** Treats context as "Compiled View" rather than raw string. Handle Pattern offloads large artifacts - agents retrieve them only via tool calls, keeping context lean.

**URL:** https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
