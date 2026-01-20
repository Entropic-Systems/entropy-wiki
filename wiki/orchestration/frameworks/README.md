# Frameworks

Multi-agent orchestration frameworks for scaling AI work to production levels.

## Available Frameworks

### [Gastown](./gastown)
Industrial-strength multi-agent coordination with the GUPP protocol. Massive scale, powerful capabilities, eats wallet.

### Flywheel
*Coming soon* - Docs will be added when available.

## When to Use Frameworks

| Scenario | Recommendation |
|----------|----------------|
| Simple tasks | No framework needed |
| Medium complexity | Basic skill orchestration |
| Large-scale projects | Gastown or similar |
| Enterprise deployment | Full framework with monitoring |

## Framework Characteristics

Good orchestration frameworks provide:

1. **Agent Registry** - Track available agents and capabilities
2. **Task Queue** - Manage work distribution
3. **State Management** - Coordinate shared context
4. **Error Recovery** - Handle failures gracefully
5. **Monitoring** - Observe what's happening

## Trade-offs

Frameworks add power but also complexity:

| Pro | Con |
|-----|-----|
| Handles massive scale | Learning curve |
| Robust error handling | Setup overhead |
| Built-in patterns | Cost (API calls) |
| Production-ready | Overkill for simple tasks |

Start simple. Add frameworks when you need scale.
