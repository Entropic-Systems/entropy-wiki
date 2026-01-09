# RepoMirror Experiment: Headless Loop Analysis

## Core Methodology

The experiment ran Claude Code in an infinite loop via CLI:
```bash
while :; do cat prompt.md | claude -p --dangerously-skip-permissions; done
```

This approach was inspired by a technique promoted by Geoff Huntley for continuous agent execution.

## Empirical Results

**Scope:** 6 ported codebases across ~29 hours of continuous operation
- **Commits Generated:** Approximately 1,100 commits total across all projects
- **Infrastructure Cost:** ~$800 for inference expenses
- **Runtime Cost:** ~$10.50/hour per Sonnet agent running overnight

## Ported Projects

1. **better-use** (Browser Use: Python → TypeScript) - "almost fully functional"
2. **ai-sdk-python** (Vercel AI SDK: TypeScript → Python)
3. **open-dedalus** (spec-to-code generation from documentation)
4. Plus 3 additional experimental ports

## Configuration & Prompts

**Minimal Prompt Principle:** The most effective prompts were simplest. One team member expanded instructions to 1,500 words with Claude's help—the agent immediately "got slower and dumber." Reverting to ~103 words restored performance.

**Generic Assistant-UI Port Prompt:**
- "Your job is to port assistant-ui-react monorepo (for react) to assistant-ui-vue (for vue)"
- Instruction to commit after "every single file edit"
- Designated `.agent/` directory as scratchpad for long-term planning
- 80/20 guidance: "spend 80% of your time on actual porting, 20% on testing"

## Tool: RepoMirror CLI

Setup creates standardized structure:
```
.repomirror/
  ├── prompt.md
  ├── sync.sh
  └── ralph.sh
```

Commands:
- `npx repomirror init --source-dir [X] --target-dir [Y] --instructions "[task]"`
- `npx repomirror sync` (single iteration)
- `npx repomirror sync-forever` (infinite loop)

## Key Validation Findings

**Self-Limiting Behavior:** Agents demonstrated emergent stopping capability—one agent used `pkill` to terminate itself upon detecting an infinite loop.

**Quality Caveats:** The headless approach delivered "90% to 100%" completeness requiring manual intervention. Several Browser Use Python demos remained non-functional in the TypeScript port despite agent claims of "100% perfectly implemented."

**Overachievement:** The AI SDK Python agent spontaneously added Flask/FastAPI integrations and Pydantic/Marshmallow validators—features absent from the original JavaScript version.

**Technical Value for Agents:** Empirical proof that deterministically bad loops can solve complex porting tasks overnight with minimal human guidance. The 80/20 rule (80% porting, 20% testing) provides optimal configuration.

**URL:** https://github.com/repomirrorhq/repomirror/blob/main/repomirror.md
