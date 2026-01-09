# Par: Parallel Worktree & Session Manager

**par** is a CLI tool that streamlines concurrent development workflows by combining Git worktrees with tmux session management. It enables developers—particularly those working with AI coding assistants—to manage multiple isolated development environments globally.

## Core Functionality

The tool creates isolated workspaces where each session gets its own directory, Git branch, and tmux session. As the documentation states, it's designed to solve a fundamental problem: "traditional Git branch switching is not ideal for handling multiple concurrent workstreams on the same repository."

## Key Capabilities

- **Global session management**: Create, list, and access development contexts from anywhere on your system
- **Multi-repository workspaces**: Coordinate changes across multiple repositories with synchronized branch naming
- **Remote command execution**: Send commands to specific sessions or broadcast to all contexts simultaneously
- **IDE integration**: Auto-generates VSCode/Cursor workspace configurations for seamless multi-repo development
- **Automatic initialization**: Executes setup commands via `.par.yaml` configuration files when creating new worktrees

## Technical Architecture

Sessions are stored in `~/.local/share/par/`, organized by repository hash. Worktree naming follows the pattern `par-<repo-name>-<repo-hash>-<label>`, enforcing globally unique labels to prevent naming conflicts across projects.

The tool requires Git, tmux, and Python 3.12+, with installation available via `uv` or pip.

**Technical Value for Agents:** CLI for Parallel Worktrees wrapped in tmux. Enables "Swarm" development - every agent gets isolated filesystem and terminal, preventing file lock collisions during parallel execution.

**URL:** https://github.com/coplane/par
