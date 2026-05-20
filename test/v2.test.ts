import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseV4ThemeCSS,
  resolveV4ThemeVariables,
  auditThemeUsage,
  isTokenUsed,
} from '../src/v4-resolver.js';
import { simulateJitCompilation } from '../src/jit-compiler.js';

describe('Tailwind CSS v2 Improvements', () => {
  const tempDir = path.resolve('./temp-test-dir');
  const mockCssPath = path.join(tempDir, 'global.css');
  const mockSrcDir = path.join(tempDir, 'src');

  beforeAll(() => {
    // Set up temp folder fixtures
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    if (!fs.existsSync(mockSrcDir)) {
      fs.mkdirSync(mockSrcDir);
    }

    // Write a mock v4 globals.css file
    const cssContent = `
      @import "tailwindcss";

      @theme {
        --color-primary-500: oklch(0.627 0.265 303.9);
        --color-deprecated-teal: oklch(0.72 0.14 186);
        --spacing-md: 1rem;
        --spacing-unused-lg: 2rem;
        --font-sans: "Inter", sans-serif;
        --radius-sm: 0.25rem;
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        --breakpoint-3xl: 1920px;
      }
    `;
    fs.writeFileSync(mockCssPath, cssContent, 'utf8');

    // Write mock component files referencing some but not all design tokens
    const component1 = `
      import React from 'react';
      export const Button = () => (
        <button className="bg-primary-500 p-md font-sans rounded-sm shadow-md 3xl:flex">
          Click me
        </button>
      );
    `;
    fs.writeFileSync(path.join(mockSrcDir, 'Button.tsx'), component1, 'utf8');

    const component2 = `
      // Checking CSS custom properties direct usage
      const style = {
        padding: 'var(--spacing-md)',
      };
    `;
    fs.writeFileSync(path.join(mockSrcDir, 'utils.ts'), component2, 'utf8');
  });

  afterAll(() => {
    // Clean up temp folder fixtures
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('resolve_v4_theme_variables', () => {
    it('should parse v4 CSS theme variables correctly', () => {
      const cssContent = fs.readFileSync(mockCssPath, 'utf8');
      const tokens = parseV4ThemeCSS(cssContent);

      expect(tokens).toEqual({
        '--color-primary-500': 'oklch(0.627 0.265 303.9)',
        '--color-deprecated-teal': 'oklch(0.72 0.14 186)',
        '--spacing-md': '1rem',
        '--spacing-unused-lg': '2rem',
        '--font-sans': '"Inter", sans-serif',
        '--radius-sm': '0.25rem',
        '--shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        '--breakpoint-3xl': '1920px',
      });
    });

    it('should resolve variables from file path', async () => {
      const result = await resolveV4ThemeVariables(mockCssPath);
      expect(result.tailwind_version).toBe('v4');
      expect(result.token_count).toBe(8);
      expect(result.tokens['--color-primary-500']).toBe('oklch(0.627 0.265 303.9)');
    });
  });

  describe('isTokenUsed', () => {
    it('should correctly detect color usage', () => {
      const content = '<div className="bg-primary-500 text-primary-500" />';
      expect(isTokenUsed(content, 'color', 'primary-500')).toBe(true);
      expect(isTokenUsed(content, 'color', 'deprecated-teal')).toBe(false);
    });

    it('should correctly detect breakpoint usage', () => {
      const content = '<div className="3xl:flex" />';
      expect(isTokenUsed(content, 'breakpoint', '3xl')).toBe(true);
      expect(isTokenUsed(content, 'breakpoint', '2xl')).toBe(false);
    });

    it('should correctly detect direct CSS custom property usage', () => {
      const content = 'style={{ color: "var(--color-primary-500)" }}';
      expect(isTokenUsed(content, 'color', 'primary-500')).toBe(true);
    });
  });

  describe('audit_theme_usage', () => {
    it('should find unused tokens and list them', async () => {
      const result = await auditThemeUsage(tempDir, mockCssPath, ['src']);

      expect(result.used_count).toBe(6); // primary-500, spacing-md, font-sans, radius-sm, shadow-md, breakpoint-3xl
      expect(result.unused_count).toBe(2); // color-deprecated-teal, spacing-unused-lg

      const unusedNames = result.unused_tokens.map((t) => t.token);
      expect(unusedNames).toContain('--color-deprecated-teal');
      expect(unusedNames).toContain('--spacing-unused-lg');
    });
  });

  describe('simulate_jit_compilation', () => {
    it('should compile valid utility classes and return generated CSS rules', async () => {
      // Since local test runs with the project's default tailwindcss v3, it will compile using v3 configuration.
      const result = await simulateJitCompilation('bg-red-500 text-white w-[500px]');

      expect(result.valid).toBe(true);
      expect(result.generated_css).toContain('background-color:');
      expect(result.generated_css).toContain('color:');
      expect(result.generated_css).toContain('width: 500px;');
    });

    it('should fail compilation for invalid class names and return error messages', async () => {
      const result = await simulateJitCompilation('bg-invalid-fake-color-999');

      expect(result.valid).toBe(false);
      expect(result.error_message).toBeDefined();
      expect(result.error_message).toContain('bg-invalid-fake-color-999');
    });
  });
});
