import fs from 'fs';
import path from 'path';
import postcss from 'postcss';

export interface V4TokenResult {
  tailwind_version: string;
  theme_file_path: string;
  token_count: number;
  tokens: Record<string, string>;
}

export interface AuditResult {
  unused_tokens: Array<{
    token: string;
    type: string;
    value: string;
    defined_in: string;
  }>;
  used_count: number;
  unused_count: number;
}

export function parseV4ThemeCSS(cssContent: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const root = postcss.parse(cssContent);

  root.walkAtRules('theme', (atRule) => {
    atRule.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        tokens[decl.prop] = decl.value;
      }
    });
  });

  return tokens;
}

export async function resolveV4ThemeVariables(cssPath: string): Promise<V4TokenResult> {
  if (!fs.existsSync(cssPath)) {
    throw new Error(`CSS stylesheet file not found: ${cssPath}`);
  }

  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const tokens = parseV4ThemeCSS(cssContent);

  return {
    tailwind_version: 'v4',
    theme_file_path: cssPath,
    token_count: Object.keys(tokens).length,
    tokens,
  };
}

function walkDir(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, extensions));
    } else {
      const ext = path.extname(fullPath).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isTokenUsed(content: string, type: string, name: string): boolean {
  // Direct variable usage (e.g., var(--color-primary-500) or style: --color-primary-500)
  if (content.includes(`--${type}-${name}`)) return true;

  const escapedName = escapeRegExp(name);
  const regexes: RegExp[] = [];

  if (type === 'color') {
    regexes.push(
      new RegExp(
        `\\b(?:bg|text|border|ring|from|via|to|fill|stroke|accent|caret|decoration|divide|outline)-${escapedName}\\b`
      )
    );
  } else if (type === 'spacing') {
    regexes.push(
      new RegExp(
        `\\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|w|h|min-w|min-h|max-w|max-h|inset|top|right|bottom|left|space-x|space-y|translate-x|translate-y|scroll-m|scroll-p)-${escapedName}\\b`
      )
    );
  } else if (type === 'font') {
    regexes.push(new RegExp(`\\bfont-${escapedName}\\b`));
  } else if (type === 'radius') {
    regexes.push(new RegExp(`\\brounded-${escapedName}\\b`));
  } else if (type === 'shadow') {
    regexes.push(new RegExp(`\\bshadow-${escapedName}\\b`));
  } else if (type === 'animate') {
    regexes.push(new RegExp(`\\banimate-${escapedName}\\b`));
  } else if (type === 'breakpoint') {
    regexes.push(new RegExp(`\\b${escapedName}:`));
  } else {
    // General fallback: check if used as [type]-[name] or just [name]
    regexes.push(new RegExp(`\\b${escapeRegExp(type)}-${escapedName}\\b`));
    regexes.push(new RegExp(`\\b${escapedName}\\b`));
  }

  // Fallback: check if substring name exists with a tailwind prefix
  if (name.length > 3 && content.includes(name)) {
    const simplePrefixRegex = new RegExp(`[\\w:-]+-${escapedName}\\b`);
    if (simplePrefixRegex.test(content)) return true;
  }

  return regexes.some((r) => r.test(content));
}

export async function auditThemeUsage(
  projectRoot: string,
  cssPath: string,
  scanDirs: string[] = ['src']
): Promise<AuditResult> {
  const { tokens } = await resolveV4ThemeVariables(cssPath);

  // Find all files to scan
  const extensions = ['.tsx', '.jsx', '.ts', '.js', '.html', '.vue', '.svelte', '.css'];
  let filesToScan: string[] = [];
  for (const dir of scanDirs) {
    const fullDir = path.isAbsolute(dir) ? dir : path.join(projectRoot, dir);
    filesToScan = filesToScan.concat(walkDir(fullDir, extensions));
  }

  // Read all file contents once into memory to optimize scanning speed
  const fileContents = filesToScan
    .filter((f) => f !== cssPath) // Don't scan the theme file itself
    .map((f) => fs.readFileSync(f, 'utf8'));

  const unusedTokens: AuditResult['unused_tokens'] = [];
  let usedCount = 0;
  let unusedCount = 0;

  for (const [token, value] of Object.entries(tokens)) {
    const withoutDash = token.slice(2); // e.g. "color-primary-50"
    const firstDashIdx = withoutDash.indexOf('-');
    let type = 'custom';
    let name = withoutDash;
    if (firstDashIdx !== -1) {
      type = withoutDash.slice(0, firstDashIdx);
      name = withoutDash.slice(firstDashIdx + 1);
    }

    const isUsed = fileContents.some((content) => isTokenUsed(content, type, name));
    if (isUsed) {
      usedCount++;
    } else {
      unusedCount++;
      unusedTokens.push({
        token,
        type,
        value,
        defined_in: cssPath,
      });
    }
  }

  return {
    unused_tokens: unusedTokens,
    used_count: usedCount,
    unused_count: unusedCount,
  };
}
