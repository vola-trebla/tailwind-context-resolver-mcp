import { createRequire } from 'module';
import path from 'path';
import postcss from 'postcss';
import fs from 'fs';

const localRequire = createRequire(import.meta.url);

export interface JitCompilationResult {
  class_string: string;
  valid: boolean;
  generated_css?: string;
  error_message?: string;
}

function findProjectRoot(startPath: string): string {
  let current = path.resolve(startPath);
  while (current !== path.parse(current).root) {
    if (
      fs.existsSync(path.join(current, 'node_modules')) ||
      fs.existsSync(path.join(current, 'package.json'))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return startPath;
}

export async function simulateJitCompilation(
  classString: string,
  cssPath?: string,
  configPath?: string
): Promise<JitCompilationResult> {
  const referencePath = cssPath || configPath || process.cwd();
  const projectRoot = findProjectRoot(referencePath);

  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tailwindPlugin: any;
  let isV4 = false;

  // 1. Resolve Tailwind PostCSS plugin
  try {
    // Try v4 PostCSS plugin
    tailwindPlugin = projectRequire('@tailwindcss/postcss');
    isV4 = true;
  } catch {
    try {
      // Try standard tailwindcss package (works for v3, and v4 if installed directly)
      tailwindPlugin = projectRequire('tailwindcss');
      try {
        const pkg = projectRequire('tailwindcss/package.json');
        if (pkg.version && pkg.version.startsWith('4.')) {
          isV4 = true;
        }
      } catch {}
    } catch {
      // Fallback to local dependencies
      try {
        tailwindPlugin = localRequire('tailwindcss');
      } catch (err: unknown) {
        return {
          class_string: classString,
          valid: false,
          error_message: `Could not resolve Tailwind CSS package: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // 2. Build input CSS
  let inputCss = '';
  if (isV4) {
    if (cssPath && fs.existsSync(cssPath)) {
      // Use their main CSS stylesheet which contains theme overrides
      inputCss = `@import "${path.resolve(cssPath)}";\n`;
    } else {
      inputCss = `@import "tailwindcss";\n`;
    }
  } else {
    // v3 imports
    inputCss = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
  }

  // Append dummy class that applies the class string
  inputCss += `\n.jit-test-class {\n  @apply ${classString};\n}\n`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pluginInstance: any;
  if (isV4) {
    // v4 plugin takes no config args, configured via CSS
    pluginInstance =
      typeof tailwindPlugin === 'function' ? tailwindPlugin() : tailwindPlugin.default();
  } else {
    // v3 plugin can take config path
    const resolvedConfig = configPath ? path.resolve(configPath) : undefined;
    pluginInstance = tailwindPlugin(resolvedConfig);
  }

  // 4. Run compiler
  const dummyCssPath = path.join(projectRoot, 'tailwind-jit-temp.css');
  try {
    const result = await postcss([pluginInstance]).process(inputCss, {
      from: dummyCssPath,
    });

    // 5. Parse compiled output and extract .jit-test-class rules
    const compiledRoot = postcss.parse(result.css);
    const rulesToKeep = new Set<postcss.Rule>();

    compiledRoot.walkRules((rule) => {
      if (rule.selector.includes('.jit-test-class')) {
        rulesToKeep.add(rule);
      }
    });

    const cleanRoot = postcss.root();
    const nodeMap = new Map<postcss.AtRule, postcss.AtRule>();

    for (const rule of rulesToKeep) {
      const pathList: postcss.AtRule[] = [];
      let parent = rule.parent;
      while (parent && parent.type === 'atrule') {
        pathList.unshift(parent as postcss.AtRule);
        parent = parent.parent;
      }

      let currentParent: postcss.Container = cleanRoot;
      for (const atRule of pathList) {
        if (!nodeMap.has(atRule)) {
          const clonedAt = postcss.atRule({ name: atRule.name, params: atRule.params });
          currentParent.append(clonedAt);
          nodeMap.set(atRule, clonedAt);
        }
        currentParent = nodeMap.get(atRule)!;
      }

      currentParent.append(rule.clone());
    }

    const generatedCss = cleanRoot.toString().trim();

    return {
      class_string: classString,
      valid: true,
      generated_css: generatedCss,
    };
  } catch (err: unknown) {
    return {
      class_string: classString,
      valid: false,
      error_message: err instanceof Error ? err.message : String(err),
    };
  }
}
