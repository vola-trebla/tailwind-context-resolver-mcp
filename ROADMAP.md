# tailwind-context-resolver-mcp — Implementation Roadmap

## What We're Building

An MCP server that loads a project's `tailwind.config.ts/js` and exposes its design system to
AI agents. Agents hallucinate Tailwind classes because they're trained on the default docs — not
on the project's custom spacing scale, brand colors, or component variants.

This MCP runs the Tailwind resolver locally and gives agents a typed, queryable interface to the
actual config.

---

## The Epistemic Blindness

When an agent generates a React component with Tailwind classes, it has no idea:

- Whether `bg-brand-primary` is a valid class in this project
- What the custom spacing scale values are (is `p-18` valid here?)
- Whether the project uses a custom prefix (e.g. `tw-flex` instead of `flex`)
- Which color palette exists beyond the Tailwind defaults
- Whether conflicting utilities are being applied (e.g. `flex grid` on the same element)

The agent guesses based on training data. Custom tokens = hallucinations.

---

## Tailwind Programmatic API

Tailwind exposes a Node.js API we can use without running a full build:

```typescript
import resolveConfig from "tailwindcss/resolveConfig.js";
import { readFileSync } from "fs";

// load and resolve the config (merges with defaults)
const userConfig = await import(configPath); // dynamic import for .ts configs
const fullConfig = resolveConfig(userConfig.default ?? userConfig);

// fullConfig.theme.colors, fullConfig.theme.spacing, etc. — all resolved
```

For class validation, we use the Tailwind CSS engine directly:

```typescript
import { createContext } from "tailwindcss/lib/lib/setupContextUtils.js";
import { generateRules } from "tailwindcss/lib/lib/generateRules.js";
```

**Problem:** Tailwind's internal APIs are not stable and differ between v3 and v4.
**Decision:** Support Tailwind v3 (most common in production). Detect v4 and warn.
**Fallback:** For class validation, use `resolveConfig` output to check if a class token exists
in the theme — without running the full JIT engine. Simpler and more stable.

---

## File Structure

```
src/
  types.ts      — result interfaces
  config.ts     — load + resolve tailwind.config, detect version
  resolver.ts   — theme token queries and class validation logic
  index.ts      — MCP server, 4 tools
```

No Playwright, no browser. Dependencies: `@modelcontextprotocol/sdk`, `zod`, `tailwindcss`.

---

## Types (src/types.ts)

```typescript
export interface TokenQueryResult {
  namespace: string;           // e.g. "colors.brand"
  tokens: Record<string, string>; // e.g. { primary: "#3b82f6", secondary: "#8b5cf6" }
  count: number;
}

export interface ClassValidationResult {
  class_string: string;
  valid_classes: string[];
  invalid_classes: string[];     // not in this project's config
  warnings: string[];            // e.g. "conflicting layout utilities"
  config_prefix: string;         // e.g. "tw-" or ""
}

export interface ConflictResult {
  class_string: string;
  conflicts: Array<{
    classes: string[];
    reason: string;             // e.g. "multiple layout models: flex, grid"
  }>;
  has_conflicts: boolean;
}

export interface ConfigSummary {
  tailwind_version: string;
  config_path: string;
  prefix: string;
  theme_extensions: string[];  // custom keys added by the project
  total_colors: number;
  total_spacing: number;
  plugins: string[];
}
```

---

## Core Logic (src/config.ts + src/resolver.ts)

### Loading the config

```typescript
// tailwind.config can be .js, .ts, .cjs, .mjs
// For .ts: use tsx/jiti to load, or require() with ts-node
// Simplest approach: dynamic import() — works for ESM .js and .ts with tsx

async function loadTailwindConfig(configPath: string) {
  const resolved = await import(configPath + "?t=" + Date.now()); // cache-bust
  const userConfig = resolved.default ?? resolved;
  return resolveConfig(userConfig);
}
```

**Problem with .ts configs:** Node.js can't natively import TypeScript.
**Solution:** Use `jiti` — a runtime TypeScript/ESM loader used internally by Tailwind CLI itself.

```typescript
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const userConfig = await jiti.import(configPath);
```

### Resolving theme tokens

After `resolveConfig`, the full theme is a plain object:

```typescript
fullConfig.theme.colors       // all colors including defaults + extensions
fullConfig.theme.spacing      // spacing scale
fullConfig.theme.fontFamily   // font stacks
fullConfig.theme.screens      // breakpoints
fullConfig.theme.extend       // project-specific additions
```

For `resolve_theme_tokens`, we do a dot-path lookup:

```typescript
function getByPath(obj: object, path: string): unknown {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}
// resolve_theme_tokens("colors.brand") → { primary: "#3b82f6", ... }
```

### Class validation strategy

Full JIT validation (running PostCSS + Tailwind) is complex and version-dependent.
Instead: **token-based validation** — check if each class maps to a known theme token.

```
"bg-brand-primary" → category: "bg", token path: "colors.brand.primary"
→ check if fullConfig.theme.colors.brand.primary exists → valid/invalid
```

Class parsing rules:
- `bg-{color}` → `theme.colors`
- `text-{color}` → `theme.colors`
- `p-{n}`, `px-{n}`, `py-{n}`, `pt-{n}` → `theme.spacing`
- `w-{n}`, `h-{n}` → `theme.spacing` + special values (full, screen, auto)
- `font-{family}` → `theme.fontFamily`
- `text-{size}` → `theme.fontSize`
- Default Tailwind values (e.g. `flex`, `grid`, `block`) → always valid

### Conflict detection

Known conflicting groups:

```typescript
const CONFLICT_GROUPS = [
  { name: "layout model", classes: ["flex", "grid", "block", "inline", "inline-flex", "inline-grid", "hidden"] },
  { name: "position", classes: ["static", "relative", "absolute", "fixed", "sticky"] },
  { name: "overflow", classes: ["overflow-auto", "overflow-hidden", "overflow-visible", "overflow-scroll"] },
  { name: "display", classes: ["table", "table-cell", "table-row", "flow-root", "contents"] },
];

// For each group: if input class_string contains >1 class from group → conflict
```

---

## Tools (src/index.ts)

### `resolve_theme_tokens`

```typescript
{
  config_path: string,          // absolute path to tailwind.config.ts/js
  namespace: string,            // dot-path: "colors", "colors.brand", "spacing"
  filter?: string               // optional substring filter on token names
}
```

Returns all tokens under that namespace. Agent can ask "what brand colors exist?" before
generating a component.

### `validate_class_string`

```typescript
{
  config_path: string,
  class_string: string          // e.g. "bg-brand-primary text-white p-4 hover:bg-brand-secondary"
}
```

Returns valid/invalid split + conflict warnings.

### `detect_css_conflicts`

```typescript
{
  config_path: string,
  class_string: string
}
```

Focused on conflict detection only — returns conflicting groups with reasons.

### `get_config_summary`

```typescript
{
  config_path: string
}
```

Returns a compact overview: version, prefix, what's been customized, plugins. Useful for the
agent to understand the project's design system at a glance before generating any code.

---

## Key Decisions

1. **Tailwind version support:** v3 only. v4 uses a completely different config format (CSS-based).
   Detect v4 and return a clear error.

2. **Config loading:** Use `jiti` for TypeScript configs. It's what Tailwind CLI uses internally —
   most reliable approach.

3. **Class validation depth:** Token-based (theme lookup), not JIT-based (PostCSS run). Simpler,
   faster, no PostCSS dependency. Catches custom token hallucinations which is 90% of the problem.

4. **Input:** `config_path` on every tool call. No global state — each call is stateless and safe
   for concurrent use.

5. **Default Tailwind classes:** Always considered valid (flex, grid, text-sm, etc.) — we only
   flag classes that look like custom tokens but don't resolve.

---

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "jiti": "^2.4.2",
    "tailwindcss": "^3.4.0",
    "zod": "^4.4.3"
  }
}
```

`jiti` — runtime TS loader (same one Tailwind CLI uses for config loading)
`tailwindcss` — for `resolveConfig` API

---

## Implementation Order

1. `src/types.ts` — result interfaces
2. `src/config.ts` — jiti-based config loader + resolveConfig wrapper
3. `src/resolver.ts` — token lookup, class parser, conflict detector
4. `src/index.ts` — 4 MCP tools
5. `npm run build` → smoke test against a real `tailwind.config.js`
6. README with emoji
7. Commit + push + publish

---

## Open Questions

1. **What to do with arbitrary utility classes like `flex`, `hidden`, `rounded`?**
   → Whitelist known non-token Tailwind utilities. Return them as valid without token lookup.

2. **Plugins like `@tailwindcss/forms`, `daisyui`?**
   → Detect plugin names in config summary. Don't try to resolve plugin-generated classes —
   mark as "possibly valid (from plugin)" rather than invalid.

3. **Dark mode variants (`dark:bg-brand-primary`)?**
   → Strip variant prefixes before validation (`dark:`, `hover:`, `lg:`, etc.)
