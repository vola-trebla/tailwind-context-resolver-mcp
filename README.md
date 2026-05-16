# tailwind-context-resolver-mcp 🎨🐸

[![npm version](https://img.shields.io/npm/v/tailwind-context-resolver-mcp.svg)](https://www.npmjs.com/package/tailwind-context-resolver-mcp)
[![npm downloads](https://img.shields.io/npm/dm/tailwind-context-resolver-mcp.svg)](https://www.npmjs.com/package/tailwind-context-resolver-mcp)
[![CI](https://github.com/vola-trebla/tailwind-context-resolver-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/vola-trebla/tailwind-context-resolver-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that loads your project's `tailwind.config.ts/js` and exposes its **actual design system** to AI agents — so they stop hallucinating class names.

---

## 🤔 The Problem

AI agents generate Tailwind classes based on training data — the default Tailwind docs. Your project is not the default docs.

You have a custom color palette. A non-standard spacing scale. Maybe a prefix like `tw-`. Brand tokens like `bg-brand-primary`. The agent doesn't know any of this. It guesses.

The result:

```jsx
// Agent confidently generates this:
<div className="bg-primary-500 text-brand p-18 tw-flex-center">

// Your project has:
// - bg-brand-primary (not bg-primary-500)
// - no "text-brand" token
// - spacing.18 = 4.5rem (ok actually)
// - no "flex-center" utility
// - no "tw-" prefix
```

The agent can't validate what it writes because it has no access to your resolved config. It's working from memory of the default theme — not yours.

---

## ✅ The Fix

This MCP server runs the Tailwind resolver locally and gives agents a typed, queryable interface to your actual config. Before writing a component, the agent can ask:

- "What brand colors exist in this project?"
- "Is `p-18` a valid spacing value here?"
- "Does this project use a custom prefix?"
- "Is `bg-brand-primary flex grid` a valid class string?"

---

## 🛠️ Tools

### `resolve_theme_tokens`

Query any namespace in the resolved Tailwind theme. Returns all design tokens as flat key-value pairs.

```
namespace: "colors.brand" → { primary: "#3b82f6", secondary: "#8b5cf6", danger: "#ef4444" }
namespace: "spacing"      → { "1": "0.25rem", "2": "0.5rem", "18": "4.5rem", ... }
namespace: "fontFamily"   → { sans: ["Inter", "sans-serif"], mono: [...] }
```

**Use before generating components** to discover what tokens actually exist.

### `validate_class_string`

Validates a Tailwind className string against the project's resolved config. Returns valid classes, invalid (hallucinated) classes, and conflict warnings.

```json
{
  "valid_classes": ["bg-brand-primary", "text-white", "p-4", "hover:bg-brand-secondary", "flex"],
  "invalid_classes": ["bg-fake-token", "text-brand"],
  "warnings": ["Conflicting multiple layout models: flex, grid"],
  "config_prefix": ""
}
```

**Use to catch hallucinated design tokens** before writing code.

### `detect_css_conflicts`

Detects conflicting Tailwind utilities — e.g. `flex` + `grid`, or `absolute` + `fixed` on the same element.

```json
{
  "conflicts": [{ "classes": ["flex", "grid"], "reason": "multiple layout models" }],
  "has_conflicts": true
}
```

### `get_config_summary`

Returns a compact overview: Tailwind version, prefix, which theme sections are customized, active plugins.

```json
{
  "tailwind_version": "3.4.19",
  "prefix": "",
  "theme_extensions": ["colors", "spacing", "fontFamily"],
  "total_colors": 142,
  "total_spacing": 34,
  "plugins": ["@tailwindcss/forms"]
}
```

**Use first** to understand the project's design system before querying specific tokens.

---

## 🚀 Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tailwind-context-resolver": {
      "command": "npx",
      "args": ["-y", "tailwind-context-resolver-mcp"]
    }
  }
}
```

### Cursor / VS Code / Any MCP client

```json
{
  "tailwind-context-resolver": {
    "command": "npx",
    "args": ["-y", "tailwind-context-resolver-mcp"]
  }
}
```

---

## 📋 Requirements

- **Tailwind CSS v3** — v4 uses a CSS-based config format and is not supported (the server will tell you clearly)
- Node.js 18+
- A `tailwind.config.js` or `tailwind.config.ts` in your project

---

## 🔧 How It Works

The server uses the same config loading strategy as the Tailwind CLI:

1. **[`jiti`](https://github.com/unjs/jiti)** loads your `tailwind.config.ts` at runtime — no `ts-node` required
2. **`tailwindcss/resolveConfig`** merges your config with Tailwind defaults to produce the full resolved theme
3. Tools perform **token-based class validation** — checking that `bg-brand-primary` maps to an actual `colors.brand.primary` token — without running the full PostCSS/JIT pipeline

This approach is fast, stable, and works with any Tailwind v3 project without additional configuration.

---

## 📖 Agent Workflow Example

```
1. get_config_summary       → understand the project's design system
2. resolve_theme_tokens     → query specific namespaces before writing classes
   (namespace: "colors.brand", "spacing")
3. validate_class_string    → validate the className string before committing it
4. detect_css_conflicts     → final sanity check for conflicting utilities
```

---

## 🐸 Part of the MCP Toolbelt

Built alongside:

- [playwright-network-chaos-mcp](https://github.com/vola-trebla/playwright-network-chaos-mcp) — network fault injection for Playwright tests
- [v8-cpu-profile-decoder-mcp](https://github.com/vola-trebla/v8-cpu-profile-decoder-mcp) — V8 CPU profile analysis for AI agents

---

## License

MIT
