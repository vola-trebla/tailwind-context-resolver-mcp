import { createRequire } from 'module';
import { createJiti } from 'jiti';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TailwindConfig = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolvedConfig = Record<string, any>;

export function getTailwindVersion(): string {
  try {
    const pkg = require('tailwindcss/package.json') as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function assertV3(version: string): void {
  if (version.startsWith('4.')) {
    throw new Error(
      `Tailwind CSS v4 uses a CSS-based config format and is not supported. Detected version: ${version}`
    );
  }
}

async function loadUserConfig(configPath: string): Promise<TailwindConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const mod = await jiti.import(configPath);
  return (mod as { default?: TailwindConfig }).default ?? (mod as TailwindConfig);
}

export async function resolveFullConfig(configPath: string): Promise<ResolvedConfig> {
  const version = getTailwindVersion();
  assertV3(version);
  const userConfig = await loadUserConfig(configPath);
  const { default: resolveConfig } = await import('tailwindcss/resolveConfig.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return resolveConfig(userConfig as any) as ResolvedConfig;
}
