import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
//  Module-import smoke test
//
//  Why this exists (AUDIT-2026-08-04-design.md §3.1): fetcher-utils.js
//  builds several large regexes at runtime via
//  `new RegExp([...].join('|'))`. esbuild cannot validate a regex
//  assembled from strings, so a syntax error in one of those arrays
//  is NOT caught by `npm run build` or `wrangler deploy` — it throws
//  at module evaluation instead. Because workers/index.js imports
//  fetcher-utils.js at the top level, and index.js is the Worker
//  entry for BOTH `fetch` and `scheduled`, that one throw takes down
//  every cron tick and every API request at once.
//
//  This test imports every worker module the same way the Worker
//  runtime does. If any module throws on import, this fails loudly
//  in CI instead of silently in production.
// ═══════════════════════════════════════════════════════════════════

const modules = import.meta.glob('/workers/*.js');

describe('worker module imports', () => {
  const paths = Object.keys(modules).filter(p => !p.includes('__tests__'));

  it('found the expected worker modules', () => {
    // Guards against import.meta.glob silently matching nothing (e.g. a
    // path pattern typo) and this test suite passing vacuously.
    expect(paths.length).toBeGreaterThanOrEqual(14);
  });

  for (const path of paths) {
    it(`imports without throwing: ${path}`, async () => {
      await expect(modules[path]()).resolves.toBeDefined();
    });
  }

  it('imports the actual Worker entry point (workers/index.js)', async () => {
    // The most important single case: this is the exact import graph
    // Cloudflare evaluates on every isolate start. If anything downstream
    // throws at module scope, this is where it surfaces.
    const entry = await import('../index.js');
    expect(entry.default).toBeDefined();
    expect(typeof entry.default.fetch).toBe('function');
    expect(typeof entry.default.scheduled).toBe('function');
  });
});
