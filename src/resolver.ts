import { ResolvedConfig } from "./config.js";
import { TokenQueryResult, ClassValidationResult, ConflictResult } from "./types.js";

const CONFLICT_GROUPS = [
  {
    reason: "multiple layout models",
    classes: [
      "flex",
      "grid",
      "block",
      "inline",
      "inline-flex",
      "inline-grid",
      "hidden",
      "flow-root",
      "contents",
      "table",
      "table-cell",
      "table-row",
    ],
  },
  {
    reason: "conflicting position",
    classes: ["static", "relative", "absolute", "fixed", "sticky"],
  },
  {
    reason: "conflicting overflow",
    classes: [
      "overflow-auto",
      "overflow-hidden",
      "overflow-visible",
      "overflow-scroll",
      "overflow-clip",
    ],
  },
  {
    reason: "conflicting text alignment",
    classes: ["text-left", "text-right", "text-center", "text-justify", "text-start", "text-end"],
  },
];

// Variant prefixes to strip before validation (hover:, dark:, lg:, etc.)
const VARIANT_RE = /^([a-z]+:)+/;

// Classes that are valid Tailwind utilities regardless of theme tokens
const ALWAYS_VALID = new Set([
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "block",
  "inline",
  "inline-block",
  "hidden",
  "contents",
  "flow-root",
  "table",
  "table-cell",
  "table-row",
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  "overflow-auto",
  "overflow-hidden",
  "overflow-visible",
  "overflow-scroll",
  "overflow-clip",
  "overflow-x-auto",
  "overflow-y-auto",
  "overflow-x-hidden",
  "overflow-y-hidden",
  "text-left",
  "text-right",
  "text-center",
  "text-justify",
  "text-start",
  "text-end",
  "font-thin",
  "font-extralight",
  "font-light",
  "font-normal",
  "font-medium",
  "font-semibold",
  "font-bold",
  "font-extrabold",
  "font-black",
  "italic",
  "not-italic",
  "underline",
  "overline",
  "line-through",
  "no-underline",
  "uppercase",
  "lowercase",
  "capitalize",
  "normal-case",
  "truncate",
  "text-ellipsis",
  "text-clip",
  "whitespace-nowrap",
  "whitespace-normal",
  "whitespace-pre",
  "whitespace-pre-wrap",
  "rounded",
  "rounded-none",
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-3xl",
  "rounded-full",
  "border",
  "border-0",
  "border-2",
  "border-4",
  "border-8",
  "shadow",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
  "shadow-none",
  "shadow-inner",
  "opacity-0",
  "opacity-25",
  "opacity-50",
  "opacity-75",
  "opacity-100",
  "cursor-auto",
  "cursor-default",
  "cursor-pointer",
  "cursor-wait",
  "cursor-text",
  "cursor-move",
  "cursor-not-allowed",
  "select-none",
  "select-text",
  "select-all",
  "select-auto",
  "pointer-events-none",
  "pointer-events-auto",
  "visible",
  "invisible",
  "collapse",
  "antialiased",
  "subpixel-antialiased",
  "list-none",
  "list-disc",
  "list-decimal",
  "appearance-none",
  "appearance-auto",
  "outline-none",
  "outline",
  "ring",
  "ring-0",
  "transition",
  "transition-none",
  "transition-all",
  "transition-colors",
  "transition-opacity",
  "transition-shadow",
  "transition-transform",
  "duration-75",
  "duration-100",
  "duration-150",
  "duration-200",
  "duration-300",
  "duration-500",
  "duration-700",
  "duration-1000",
  "ease-linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "sr-only",
  "not-sr-only",
  "container",
  "mx-auto",
  "my-auto",
  "m-auto",
  "inset-0",
  "inset-x-0",
  "inset-y-0",
  "top-0",
  "right-0",
  "bottom-0",
  "left-0",
  "top-auto",
  "right-auto",
  "bottom-auto",
  "left-auto",
  "z-0",
  "z-10",
  "z-20",
  "z-30",
  "z-40",
  "z-50",
  "z-auto",
  "w-full",
  "w-screen",
  "w-auto",
  "w-fit",
  "w-min",
  "w-max",
  "h-full",
  "h-screen",
  "h-auto",
  "h-fit",
  "h-min",
  "h-max",
  "min-w-0",
  "min-w-full",
  "max-w-none",
  "max-w-full",
  "max-w-screen-sm",
  "max-w-screen-md",
  "max-w-screen-lg",
  "max-w-screen-xl",
  "min-h-0",
  "min-h-full",
  "min-h-screen",
  "max-h-full",
  "max-h-screen",
  "flex-1",
  "flex-auto",
  "flex-none",
  "flex-initial",
  "flex-row",
  "flex-col",
  "flex-row-reverse",
  "flex-col-reverse",
  "flex-wrap",
  "flex-nowrap",
  "flex-wrap-reverse",
  "items-start",
  "items-end",
  "items-center",
  "items-baseline",
  "items-stretch",
  "justify-start",
  "justify-end",
  "justify-center",
  "justify-between",
  "justify-around",
  "justify-evenly",
  "gap-0",
  "gap-px",
  "self-auto",
  "self-start",
  "self-end",
  "self-center",
  "self-stretch",
  "self-baseline",
  "grow",
  "grow-0",
  "shrink",
  "shrink-0",
  "grid-cols-1",
  "grid-cols-2",
  "grid-cols-3",
  "grid-cols-4",
  "grid-cols-6",
  "grid-cols-12",
  "grid-cols-none",
  "col-span-1",
  "col-span-2",
  "col-span-3",
  "col-span-full",
  "grid-rows-1",
  "grid-rows-2",
  "grid-rows-3",
  "row-span-1",
  "row-span-2",
  "row-span-full",
  "place-items-center",
  "place-content-center",
  "object-contain",
  "object-cover",
  "object-fill",
  "object-none",
  "object-scale-down",
  "object-top",
  "object-center",
  "object-bottom",
  "object-left",
  "object-right",
  "overflow-ellipsis",
  "break-words",
  "break-all",
  "break-normal",
  "break-keep",
  "resize",
  "resize-none",
  "resize-x",
  "resize-y",
  "float-right",
  "float-left",
  "float-none",
  "clear-left",
  "clear-right",
  "clear-both",
  "clear-none",
]);

function getByPath(obj: ResolvedConfig, path: string): ResolvedConfig | undefined {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function flattenTokens(obj: unknown, prefix = ""): Record<string, string> {
  if (typeof obj === "string") return prefix ? { [prefix]: obj } : {};
  if (typeof obj !== "object" || obj === null) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[fullKey] = value;
    } else if (typeof value === "object") {
      Object.assign(result, flattenTokens(value, fullKey));
    }
  }
  return result;
}

export function resolveTokens(
  config: ResolvedConfig,
  namespace: string,
  filter?: string
): TokenQueryResult {
  const section = getByPath(config.theme ?? config, namespace);
  if (!section) {
    throw new Error(
      `Namespace "${namespace}" not found in resolved Tailwind config. Try: colors, spacing, fontFamily, fontSize, screens`
    );
  }
  const flat = flattenTokens(section);
  const tokens = filter
    ? Object.fromEntries(Object.entries(flat).filter(([k]) => k.includes(filter)))
    : flat;
  return { namespace, tokens, count: Object.keys(tokens).length };
}

function stripVariants(cls: string): string {
  return cls.replace(VARIANT_RE, "");
}

function classMatchesTheme(cls: string, config: ResolvedConfig): boolean {
  if (ALWAYS_VALID.has(cls)) return true;

  const theme = config.theme ?? config;

  // bg-{color} / text-{color} / border-{color} / ring-{color}
  const colorMatch = cls.match(
    /^(?:bg|text|border|ring|from|via|to|fill|stroke|accent|caret|decoration)-(.+)$/
  );
  if (colorMatch) {
    const token = colorMatch[1];
    return !!getByPath(theme.colors ?? {}, token.replace(/-/g, "."));
  }

  // p-{n} px-{n} py-{n} pt-{n} pr-{n} pb-{n} pl-{n} m-{n} mx-{n} etc.
  const spacingMatch = cls.match(
    /^(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|space-x|space-y|gap|gap-x|gap-y)-(.+)$/
  );
  if (spacingMatch) {
    const token = spacingMatch[1];
    return !!theme.spacing?.[token];
  }

  // w-{n} h-{n} (non-special values)
  const sizeMatch = cls.match(/^(?:w|h|min-w|min-h|max-w|max-h)-(.+)$/);
  if (sizeMatch) {
    const token = sizeMatch[1];
    return !!(theme.spacing?.[token] || theme.width?.[token] || theme.height?.[token]);
  }

  // text-{size} (font size)
  const fontSizeMatch = cls.match(/^text-(.+)$/);
  if (fontSizeMatch) {
    const token = fontSizeMatch[1];
    return !!(theme.fontSize?.[token] || theme.colors?.[token.replace(/-/g, ".")]);
  }

  // font-{family}
  const fontFamilyMatch = cls.match(/^font-(.+)$/);
  if (fontFamilyMatch) {
    const token = fontFamilyMatch[1];
    return !!(
      theme.fontFamily?.[token] ||
      [
        "thin",
        "extralight",
        "light",
        "normal",
        "medium",
        "semibold",
        "bold",
        "extrabold",
        "black",
      ].includes(token)
    );
  }

  // rounded-{size}
  const roundedMatch = cls.match(/^rounded(?:-(.+))?$/);
  if (roundedMatch) {
    const token = roundedMatch[1];
    return !token || !!theme.borderRadius?.[token];
  }

  // opacity-{n}
  const opacityMatch = cls.match(/^opacity-(.+)$/);
  if (opacityMatch) {
    return !!theme.opacity?.[opacityMatch[1]];
  }

  // leading-{n}
  const leadingMatch = cls.match(/^leading-(.+)$/);
  if (leadingMatch) return !!theme.lineHeight?.[leadingMatch[1]];

  // tracking-{n}
  const trackingMatch = cls.match(/^tracking-(.+)$/);
  if (trackingMatch) return !!theme.letterSpacing?.[trackingMatch[1]];

  // z-{n}
  const zMatch = cls.match(/^z-(.+)$/);
  if (zMatch) return !!theme.zIndex?.[zMatch[1]];

  // duration-{n} / delay-{n}
  const durationMatch = cls.match(/^(?:duration|delay)-(.+)$/);
  if (durationMatch)
    return !!(
      theme.transitionDuration?.[durationMatch[1]] || theme.transitionDelay?.[durationMatch[1]]
    );

  // inset-{n} top-{n} etc (non-zero)
  const insetMatch = cls.match(/^(?:inset|top|right|bottom|left)-(.+)$/);
  if (insetMatch) {
    const token = insetMatch[1];
    return !!(theme.spacing?.[token] || theme.inset?.[token]);
  }

  return false;
}

export function validateClasses(
  config: ResolvedConfig,
  classString: string
): ClassValidationResult {
  const prefix = (config.prefix as string) ?? "";
  const classes = classString.trim().split(/\s+/).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];

  for (const cls of classes) {
    const withoutVariant = stripVariants(cls);
    const withoutPrefix =
      prefix && withoutVariant.startsWith(prefix)
        ? withoutVariant.slice(prefix.length)
        : withoutVariant;

    if (classMatchesTheme(withoutPrefix, config)) {
      valid.push(cls);
    } else {
      invalid.push(cls);
    }
  }

  // conflict check inline
  for (const group of CONFLICT_GROUPS) {
    const found = classes.map(stripVariants).filter((c) => group.classes.includes(c));
    if (found.length > 1) {
      warnings.push(`Conflicting ${group.reason}: ${found.join(", ")}`);
    }
  }

  return {
    class_string: classString,
    valid_classes: valid,
    invalid_classes: invalid,
    warnings,
    config_prefix: prefix,
  };
}

export function detectConflicts(config: ResolvedConfig, classString: string): ConflictResult {
  const classes = classString.trim().split(/\s+/).filter(Boolean).map(stripVariants);
  const conflicts: ConflictResult["conflicts"] = [];

  for (const group of CONFLICT_GROUPS) {
    const found = classes.filter((c) => group.classes.includes(c));
    if (found.length > 1) {
      conflicts.push({ classes: found, reason: group.reason });
    }
  }

  return { class_string: classString, conflicts, has_conflicts: conflicts.length > 0 };
}
