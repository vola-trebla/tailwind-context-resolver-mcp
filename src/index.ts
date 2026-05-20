#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { resolveFullConfig, getTailwindVersion } from './config.js';
import { resolveTokens, validateClasses, detectConflicts } from './resolver.js';
import { resolveV4ThemeVariables, auditThemeUsage } from './v4-resolver.js';
import { simulateJitCompilation } from './jit-compiler.js';
import { ConfigSummary } from './types.js';

const server = new McpServer({
  name: 'tailwind-context-resolver-mcp',
  version: '0.2.0',
});

function errorResponse(err: unknown) {
  return {
    content: [
      { type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` },
    ],
    isError: true,
  };
}

server.registerTool(
  'resolve_theme_tokens',
  {
    description:
      'Queries the resolved Tailwind CSS theme for a specific namespace and returns all design tokens. ' +
      'Use before generating components to discover what colors, spacing, or font values actually exist in this project. ' +
      "Example namespaces: 'colors', 'colors.brand', 'spacing', 'fontFamily', 'fontSize', 'screens'.",
    inputSchema: {
      config_path: z.string().describe('Absolute path to tailwind.config.js or tailwind.config.ts'),
      namespace: z
        .string()
        .describe("Dot-path into the theme (e.g. 'colors', 'colors.brand', 'spacing')"),
      filter: z.string().optional().describe('Optional substring filter on token names'),
    },
  },
  async ({ config_path, namespace, filter }) => {
    try {
      const config = await resolveFullConfig(config_path);
      const result = resolveTokens(config, namespace, filter);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'validate_class_string',
  {
    description:
      "Validates a Tailwind CSS className string against the project's actual config. " +
      'Returns valid_classes, invalid_classes (hallucinated tokens), possibly_valid_classes (plugin-generated — cannot verify without PostCSS), and conflict warnings. ' +
      'Handles variants (hover:, dark:, lg:), important (!), opacity modifiers (/50), negative values (-mt-4), and arbitrary values ([32rem]). ' +
      'Use to catch hallucinated design tokens before writing code.',
    inputSchema: {
      config_path: z.string().describe('Absolute path to tailwind.config.js or tailwind.config.ts'),
      class_string: z.string().describe('Space-separated Tailwind class string to validate'),
    },
  },
  async ({ config_path, class_string }) => {
    try {
      const config = await resolveFullConfig(config_path);
      const result = validateClasses(config, class_string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'detect_css_conflicts',
  {
    description:
      "Detects conflicting Tailwind utility classes in a className string — e.g. applying both 'flex' and 'grid', " +
      'or multiple position utilities. Use to prevent silent CSS bugs before generating or reviewing component code.',
    inputSchema: {
      config_path: z.string().describe('Absolute path to tailwind.config.js or tailwind.config.ts'),
      class_string: z
        .string()
        .describe('Space-separated Tailwind class string to check for conflicts'),
    },
  },
  async ({ config_path, class_string }) => {
    try {
      const config = await resolveFullConfig(config_path);
      const result = detectConflicts(config, class_string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'get_config_summary',
  {
    description:
      "Returns a compact overview of the project's Tailwind configuration: version, prefix, " +
      'which theme sections have been customized, and what plugins are active. ' +
      "Use first to understand the project's design system before querying specific tokens.",
    inputSchema: {
      config_path: z.string().describe('Absolute path to tailwind.config.js or tailwind.config.ts'),
    },
  },
  async ({ config_path }) => {
    try {
      const config = await resolveFullConfig(config_path);
      const theme = config.theme ?? {};
      const extend = theme.extend ?? {};

      const plugins = ((config.plugins ?? []) as Array<{ name?: string } | (() => void)>)
        .map((p) =>
          typeof p === 'function' ? p.name || '(anonymous plugin)' : p.name || '(anonymous plugin)'
        )
        .filter(Boolean);

      const summary: ConfigSummary = {
        tailwind_version: getTailwindVersion(),
        config_path,
        prefix: (config.prefix as string) ?? '',
        theme_extensions: Object.keys(extend),
        total_colors: Object.keys(theme.colors ?? {}).length,
        total_spacing: Object.keys(theme.spacing ?? {}).length,
        plugins,
      };

      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'resolve_v4_theme_variables',
  {
    description:
      "Parses the project's root CSS file (Tailwind CSS v4) and extracts all design tokens defined in @theme blocks. " +
      'Returns a flat map of CSS custom properties (e.g., --color-primary-500 -> oklch(...)).',
    inputSchema: {
      css_path: z
        .string()
        .describe(
          'Absolute path to the CSS file containing the @theme or @import "tailwindcss" directives'
        ),
    },
  },
  async ({ css_path }) => {
    try {
      const result = await resolveV4ThemeVariables(css_path);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'audit_theme_usage',
  {
    description:
      'Identifies dead design tokens by scanning the project files. ' +
      'Checks each CSS custom property defined in @theme blocks to see if it is referenced anywhere in the source code.',
    inputSchema: {
      project_root: z.string().describe('Absolute path to the project root directory'),
      css_path: z.string().describe('Absolute path to the CSS file containing the @theme blocks'),
      scan_dirs: z
        .array(z.string())
        .optional()
        .describe('Optional array of subdirectories to scan (defaults to ["src"])'),
    },
  },
  async ({ project_root, css_path, scan_dirs }) => {
    try {
      const result = await auditThemeUsage(project_root, css_path, scan_dirs);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'simulate_jit_compilation',
  {
    description:
      'Validates Tailwind utility classes against the JIT engine by programmatically compiling them. ' +
      'Supports complex arbitrary values, JIT modifiers, and custom plugin classes. Returns the generated CSS rules.',
    inputSchema: {
      class_string: z.string().describe('Space-separated Tailwind class string to compile'),
      css_path: z
        .string()
        .optional()
        .describe(
          "Optional path to the project's CSS entry file (for Tailwind v4 custom theme styles)"
        ),
      config_path: z
        .string()
        .optional()
        .describe('Optional path to tailwind.config.js/ts (for Tailwind v3 custom configs)'),
    },
  },
  async ({ class_string, css_path, config_path }) => {
    try {
      const result = await simulateJitCompilation(class_string, css_path, config_path);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
