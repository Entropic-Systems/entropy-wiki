# GitHub CLI Integration

Native GitHub operations through the `gh` command for pull requests, issues, code review, and repository management.

## Overview

GitHub CLI (`gh`) integration enables Claude Code to interact directly with GitHub repositories through the Bash tool. This provides:
- **Pull request creation** - Create PRs with comprehensive descriptions
- **Issue management** - View, create, and update issues
- **Code review** - Comment on PRs, view diffs, check status
- **Repository operations** - Clone, fork, view details
- **Release management** - Create releases, view tags
- **GitHub Actions** - View workflow runs, check CI status

## Installation

### 1. Install GitHub CLI

**macOS**:
```bash
brew install gh
```

**Linux**:
```bash
# Debian/Ubuntu
sudo apt install gh

# Fedora/RHEL
sudo dnf install gh
```

**Windows**:
```bash
winget install GitHub.cli
```

### 2. Authenticate

```bash
gh auth login
```

Follow the prompts to authenticate via browser or token.

### 3. Verify Installation

```bash
gh --version
gh auth status
```

## Core Commands

### Pull Requests

#### Create PR
```bash
gh pr create \
  --title "Add user authentication" \
  --body "$(cat <<'EOF'
## Summary
- Implement JWT-based authentication
- Add login/logout endpoints
- Include session management

## Test plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing complete

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

#### View PRs
```bash
# List PRs
gh pr list

# View specific PR
gh pr view 123

# View PR diff
gh pr diff 123

# View PR checks/status
gh pr checks 123
```

#### PR Comments
```bash
# Add comment
gh pr comment 123 --body "LGTM! 🚀"

# View comments
gh api repos/{owner}/{repo}/pulls/123/comments
```

### Issues

#### Create Issue
```bash
gh issue create \
  --title "Fix authentication bug" \
  --body "Description of the bug" \
  --label "bug" \
  --assignee "@me"
```

#### Manage Issues
```bash
# List issues
gh issue list

# View issue
gh issue view 456

# Close issue
gh issue close 456

# Reopen issue
gh issue reopen 456
```

### Repository

#### Clone & Fork
```bash
# Clone repository
gh repo clone owner/repo

# Fork repository
gh repo fork owner/repo

# View repository details
gh repo view owner/repo
```

#### Releases
```bash
# Create release
gh release create v1.0.0 \
  --title "Release 1.0.0" \
  --notes "Release notes here"

# List releases
gh release list

# View release
gh release view v1.0.0
```

### Workflows

#### View CI Status
```bash
# List workflow runs
gh run list

# View specific run
gh run view 789

# Watch run in progress
gh run watch 789
```

## Integration with Git Workflow

The GitHub CLI enhances the git-workflow skill with PR capabilities.

### Creating Pull Requests (git-workflow)

When git-workflow skill creates commits, it can now create PRs:

```bash
# 1. Commit changes (git-workflow)
git status
git diff --stat
git add .
git commit -m "..."

# 2. Push to branch
git push -u origin feature-branch

# 3. Create PR (GitHub CLI)
gh pr create \
  --title "Feature: Add dark mode toggle" \
  --body "$(cat <<'EOF'
## Summary
- Add ThemeProvider context
- Implement theme toggle button
- Persist theme preference to localStorage
- Update all components for theme support

## Test plan
- [ ] Toggle switches between themes
- [ ] Theme persists on reload
- [ ] All pages work in both themes
- [ ] No console errors

## Side products
- Added validation-before-close skill
- Updated playwright-testing skill
- Enhanced auto-documentation skill

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Comprehensive PR Workflow

Full flow from commit to PR:

```markdown
1. Work complete, ready to commit
   ↓
2. git-workflow skill:
   - git status (review ALL changes)
   - Categorize: Primary vs Side Products
   - git add .
   - Comprehensive commit message
   - git commit
   ↓
3. Check branch status
   - Is branch pushed to remote?
   - Does it track remote branch?
   ↓
4. Push if needed:
   - git push -u origin branch-name
   ↓
5. Create PR with gh:
   - Generate summary from commits
   - Include test plan
   - List side products
   - Reference related issues
   ↓
6. Verify PR created:
   - gh pr view
   - Check CI status
   - Review in browser
```

## Common Use Cases

### 1. Feature Branch → PR

Complete workflow for feature development:

```bash
# Commit changes
git add .
git commit -m "feat: add user profile page"

# Push branch
git push -u origin feature/user-profile

# Create PR
gh pr create \
  --title "Feature: User profile page" \
  --body "Implements user profile with avatar upload and settings"

# Check CI status
gh pr checks
```

### 2. Bug Fix → PR

Quick bug fix workflow:

```bash
# Fix bug, commit
git commit -am "fix: resolve token refresh race condition"

# Push
git push

# Create PR with auto-fill from commits
gh pr create --fill

# Link to issue
gh pr edit --add-label "bug"
```

### 3. Review PR

Review someone else's PR:

```bash
# View PR details
gh pr view 123

# Check out PR locally
gh pr checkout 123

# Test changes
npm test

# Leave review
gh pr review 123 --approve --body "Looks good!"
```

### 4. Check CI Status

Monitor continuous integration:

```bash
# View checks for current PR
gh pr checks

# Watch workflow run
gh run watch

# View failed checks
gh pr checks --watch
```

## Integration with Beads

GitHub CLI works seamlessly with beads workflow:

```bash
# Close bead
bd close entropy-wiki-abc

# Commit bead work
git add .
git commit -m "feat: implement feature X"

# Push and create PR
git push -u origin feature-x
gh pr create --fill

# Link PR to bead in comments
bd comment entropy-wiki-abc "PR created: https://github.com/owner/repo/pull/123"
```

## Advanced Usage

### PR Templates

Use heredoc for structured PR bodies:

```bash
gh pr create --title "Title" --body "$(cat <<'EOF'
## Problem
[What problem does this solve?]

## Solution
[How does this solve it?]

## Changes
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Unit tests pass
- [ ] Manual testing complete
- [ ] Documentation updated

## Screenshots
[If UI changes]

## Related Issues
Fixes #123
Related to #456

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Draft PRs

Create draft PRs for work in progress:

```bash
gh pr create \
  --title "WIP: Feature X" \
  --body "Work in progress" \
  --draft
```

### PR from Commits

Auto-generate PR description from commits:

```bash
# Create PR using commit messages
gh pr create --fill

# Or custom title with commit messages as body
gh pr create --title "Feature: Auth system" --fill-first
```

### Multi-repo Operations

Work across multiple repositories:

```bash
# Set repo context
gh repo set-default owner/repo

# Or specify repo explicitly
gh pr list --repo owner/repo

# Or use full repo path
gh pr create --repo owner/repo --title "..."
```

## Best Practices

### Do

✅ **Create comprehensive PR descriptions**
- Summary of changes
- Test plan with checkboxes
- Link to related issues
- Include screenshots for UI changes

✅ **Use semantic PR titles**
- "feat: add feature X"
- "fix: resolve bug Y"
- "refactor: improve module Z"

✅ **Check CI before requesting review**
```bash
gh pr checks --watch
```

✅ **Link PRs to issues**
```bash
# In PR body
Fixes #123
Closes #456
```

✅ **Use draft PRs for WIP**
```bash
gh pr create --draft
gh pr ready  # Mark ready when done
```

### Don't

❌ **Don't create PRs without comprehensive descriptions**
- Bad: "Updates"
- Good: "Add JWT authentication with tests"

❌ **Don't skip test plan**
- Always include what was tested
- Use checkboxes for reviewers

❌ **Don't forget to push before creating PR**
```bash
git push -u origin branch-name
gh pr create
```

❌ **Don't ignore CI failures**
- Fix issues before requesting review
- Use `gh pr checks` to monitor

## Troubleshooting

### Not Authenticated
**Symptom**: `gh` commands fail with auth error

**Solution**:
```bash
gh auth login
gh auth status
```

### No Default Repository
**Symptom**: "could not determine current repository"

**Solution**:
```bash
# Set default repo
gh repo set-default owner/repo

# Or specify repo explicitly
gh pr create --repo owner/repo ...
```

### Push Rejected
**Symptom**: Can't push branch before PR creation

**Solution**:
```bash
# Pull latest changes
git pull origin main

# Rebase if needed
git rebase main

# Force push (if rebased)
git push --force-with-lease
```

## GitHub API Access

For advanced operations, use `gh api`:

```bash
# Get PR comments
gh api repos/{owner}/{repo}/pulls/123/comments

# Get workflow runs
gh api repos/{owner}/{repo}/actions/runs

# Get issue details
gh api repos/{owner}/{repo}/issues/456
```

## Environment Variables

Configure `gh` behavior:

```bash
# Set default editor
export EDITOR=vim

# Set default repository
export GH_REPO=owner/repo

# Use different token
export GH_TOKEN=ghp_xxxxx
```

## Quick Reference

```markdown
Pull Requests:
  gh pr create --title "..." --body "..."
  gh pr list
  gh pr view 123
  gh pr checks

Issues:
  gh issue create --title "..." --body "..."
  gh issue list
  gh issue view 456

Repository:
  gh repo clone owner/repo
  gh repo fork owner/repo
  gh repo view

Workflows:
  gh run list
  gh run view 789
  gh run watch

Authentication:
  gh auth login
  gh auth status
```

## Related Documentation

- [git-workflow Skill](../.claude/skills/git-workflow/SKILL.md) - Comprehensive commit workflow
- [Official GitHub CLI Docs](https://cli.github.com/manual/) - Complete command reference
- [GitHub CLI GitHub Repository](https://github.com/cli/cli) - Source and issue tracking
