---
title: Your AI Agent Hallucinates Tailwind Classes. Here's the Fix.
published: false
description: An MCP server that loads your tailwind.config.ts and exposes the actual resolved design system to AI agents — so they stop guessing class names.
tags: tailwind, ai, mcp, webdev
---

Your AI agent is confidently writing Tailwind classes that don't exist in your project.

`bg-primary-500`? Your project uses `bg-brand-primary`.
`p-18`? Only valid if your spacing scale includes it.
`tw-flex`? Only if your config sets `prefix: "tw-"`.

The agent doesn't know. It's working from training data — the default Tailwind docs, not your config.

---

## The Epistemic Blindness

When an agent generates a React component, it has no idea:

- Whether `bg-brand-primary` is a valid class **in this project**
- What your custom spacing scale looks like (is `p-18` valid here?)
- Whether you're using a custom prefix like `tw-`
- Which brand colors exist beyond the Tailwind defaults
- Whether `flex grid` on the same element is a conflict

It guesses. Custom tokens = hallucinations. Every time.

---

## The Fix: Give the Agent Your Actual Config

[`tailwind-context-resolver-mcp`](https://github.com/vola-trebla/tailwind-context-resolver-mcp) is an MCP server that loads your `tailwind.config.ts/js` and exposes its resolved design system as queryable tools.

Before writing a component, the agent can:

```
→ get_config_summary        understand the project's design system
→ resolve_theme_tokens      query what colors/spacing actually exist
→ validate_class_string     verify the className before committing it
→ detect_css_conflicts      catch flex+grid on the same element
```

Real output from `validate_class_string`:

```json
{
  "valid_classes": ["bg-brand-primary", "text-white", "p-4", "hover:dark:bg-brand-secondary"],
  "invalid_classes": ["bg-fake-token"],
  "possibly_valid_classes": ["btn", "prose"],
  "warnings": ["Conflicting multiple layout models: flex, grid"]
}
```

---

## How It Works

The server uses the same config loading strategy as the Tailwind CLI itself:

1. **[`jiti`](https://github.com/unjs/jiti)** loads your `tailwind.config.ts` at runtime — no `ts-node` setup needed
2. **`tailwindcss/resolveConfig`** merges your config with Tailwind defaults → full resolved theme
3. **Token-based validation** — checks that `bg-brand-primary` maps to an actual `colors.brand.primary` token — without running PostCSS or the full JIT pipeline

The class parser handles the full Tailwind syntax:

- `!hover:dark:bg-brand-primary/50` → strips `!`, `hover:dark:`, `/50` before lookup
- `bg-[#ff0000]` → arbitrary values are always valid
- `-mt-4` → negative prefix stripped, looks up spacing token `4`
- `group-hover:text-white` → multi-word variants handled correctly
- Unknown classes when plugins are active → `possibly_valid_classes` (can't verify `btn` or `prose` without PostCSS)

---

## Setup

Add to Claude Desktop / Cursor / any MCP client:

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

Then pass your config path on each tool call:

```
config_path: "/absolute/path/to/tailwind.config.ts"
```

---

## Tailwind v3 Only

v4 uses a CSS-based config format — the programmatic `resolveConfig` API doesn't apply. The server detects v4 and returns a clear error instead of silently failing.

---

## Links

- 📦 [npm](https://www.npmjs.com/package/tailwind-context-resolver-mcp)
- 🐙 [GitHub](https://github.com/vola-trebla/tailwind-context-resolver-mcp)

---

_Part of a series of MCP tools for making AI agents actually useful in real codebases. Also check out [v8-cpu-profile-decoder-mcp](https://www.npmjs.com/package/v8-cpu-profile-decoder-mcp) for Node.js performance profiling._
