# Context Engineering for AI Agents: Key Concepts

## Context Engineering vs. Prompt Engineering

**Prompt engineering** focuses on crafting effective LLM instructions, particularly system prompts. **Context engineering** represents the broader evolution—managing the entire token composition during inference, including system instructions, tools, external data, and message history across multiple turns.

As Anthropic explains: *"context engineering is iterative and the curation phase happens each time we decide what to pass to the model."*

## Context Rot Phenomenon

LLMs experience performance degradation as context length increases. Research shows that *"as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."*

This stems from transformer architecture's n² pairwise token relationships. Models trained on shorter sequences have fewer specialized parameters for long-range dependencies, creating a performance gradient rather than a hard cliff.

## Context Compaction Strategies

For long-horizon tasks, compaction summarizes conversations nearing capacity limits and reinitiate new context windows. The technique balances recall and precision—preserving architectural decisions and critical details while discarding redundant outputs. Claude Code implements this by compressing message history while retaining recently accessed files.

## Progressive Disclosure Patterns

Agents navigate and retrieve data autonomously, incrementally discovering relevant context. File sizes suggest complexity; naming conventions hint at purpose; timestamps indicate relevance. This self-managed approach keeps agents focused on necessary information rather than exhaustive datasets, mirroring human cognition patterns.

**Technical Value for Agents:** Defines "Context Rot" and strategies for mitigating it. Progressive Disclosure (loading files only when needed) maintains agent IQ over long sessions. Context Compaction preserves critical decisions while discarding redundant outputs.

**URL:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
