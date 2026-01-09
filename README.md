# entropy-wiki

> [!NOTE]
> Entropy is the raw chaos of real systems. We capture it, compress it, and ship it as repeatable advantage.

## Mission
Build a cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets. High-signal, plug-and-play, and deployable via Next.js.

## Quick Start

### View the Wiki (Development Mode)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Visit the wiki
open http://localhost:3000
```

The wiki runs on **Next.js 15** with App Router. All documentation in `docs/` is automatically parsed and rendered as MDX content with custom components.

### Build for Production

```bash
# Build static site (generates all pages via SSG)
npm run build

# Start production server
npm start
```

### Update Navigation

After adding new markdown files:

```bash
npm run gen-meta
```

This auto-generates `_meta.json` files for sidebar navigation. The wiki automatically discovers and routes all markdown files in `docs/`.

## Architecture

### Content Structure
- `docs/beads/`: Atomic logic snippets and issue tracking system
- `docs/gastown/`: Multi-agent orchestration and rig standards
- `docs/skills-bank/`: Functional capabilities
- `docs/prompt-bank/`: Categorized, high-performance prompts
- `docs/tooling-mcp/`: MCP server configs, custom tool definitions, API bridge logic
- `docs/orchestration/`: Multi-agent handoff protocols and state-management
- `docs/context/`: MAP.md strategies, context pruning, token saving
- `docs/lab/`: Learnings, failure logs, model-specific quirks

### Technical Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS with CSS variables for theming
- **Markdown**: react-markdown with GFM support
- **Search**: FlexSearch for client-side full-text search
- **Deployment**: Vercel (optimized for static generation)

### Component Architecture

The wiki is built with reusable React components:

- **DocLayout** (`components/doc-layout.tsx`): Main layout wrapper with sidebar navigation
- **Sidebar** (`components/sidebar.tsx`): Section-aware navigation with active state
- **SectionNav** (`components/section-nav.tsx`): Top-level section switcher
- **Breadcrumb** (`components/breadcrumb.tsx`): Path navigation for current page
- **SearchBar** (`components/search-bar.tsx`): Client-side search with FlexSearch
- **ThemeToggle** (`components/theme-toggle.tsx`): Dark/light mode switcher

### Adding New Content

1. Create a markdown file in the appropriate `docs/` subdirectory
2. Add frontmatter with `title` and optional `description`:
   ```markdown
   ---
   title: Your Page Title
   description: Optional description text
   ---

   # Your Page Title
   Content goes here...
   ```
3. Run `npm run gen-meta` to update navigation
4. The page is automatically available at `/section/your-file`

> [!TIP]
> Keep entries short, dense, and operational. If a file can't be executed, it should at least be copy-pastable.

> [!CAUTION]
> Avoid fluff. Every line should either increase capability or reduce ambiguity.
