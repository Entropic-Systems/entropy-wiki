# Run Claude Code From Your iPhone - Complete Setup Guide

## Access Note
**Medium article blocked by WebFetch (403 error).** Access directly at URL below for full content.

## Core Stack Components (from source description)

### 1. Tailscale
- Creates mesh network between iPhone and desktop
- Bypasses firewall requirements
- Enables secure remote access without port forwarding

### 2. Termius
- SSH client for iPhone
- Connects to desktop via Tailscale network
- Provides terminal interface on mobile device

### 3. tmux
- Terminal multiplexer on desktop
- Keeps Claude Code sessions persistent
- Allows attaching/detaching from mobile

## Workflow Pattern

```
Desktop: Start Claude Code in tmux session
      ↓
iPhone: Connect via Termius + Tailscale
      ↓
iPhone: Attach to tmux session
      ↓
Result: Full Claude Code access from mobile
```

## tmux.conf Settings

The article contains **specific tmux.conf settings** required to map iPhone touch events to terminal scrolling. These configurations are essential for usable mobile interaction.

**Critical configurations include:**
- Touch gesture mappings
- Scroll behavior settings
- Mobile-optimized key bindings

## Use Cases

- Monitor long-running agents while away from desktop
- Initiate development tasks remotely
- Check on Ralph Wiggum loops from anywhere
- Mobile "vibe coding" - steering agents on the go

**Manual Access Required:** Visit URL for complete tmux.conf configurations and detailed setup instructions.

**URL:** https://petesena.medium.com/how-to-run-claude-code-from-your-iphone-using-tailscale-termius-and-tmux-2e16d0e5f68b
