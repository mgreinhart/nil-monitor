import { describe, it, expect, beforeEach } from 'vitest';
import { insertHeadline, loadDedupCache, clearDedupCache } from '../fetcher-utils.js';

// ═══════════════════════════════════════════════════════════════════
//  insertHeadline() full-chain integration test
//
//  The classifier fixtures test each filter in isolation. This tests
//  the wiring between them: staleness guard → noise filters → URL
//  normalization → categorization → dedup cache → insert. A minimal
//  in-memory fake stands in for D1's prepare().bind().all()/.run()
//  chainable API — just enough to exercise the two queries
//  insertHeadline actually issues.
// ═══════════════════════════════════════════════════════════════════

function createFakeD1() {
  const rows = [];
  function statement(sql, boundArgs = []) {
    return {
      all: async () => {
        if (/SELECT title FROM headlines/i.test(sql)) {
          return { results: rows.map(r => ({ title: r.title })) };
        }
        return { results: [] };
      },
      first: async () => null,
      run: async () => {
        if (/INSERT OR IGNORE INTO headlines/i.test(sql)) {
          const [source, title, url, category, published_at] = boundArgs;
          // Mirror SQLite's INSERT OR IGNORE against the url UNIQUE constraint.
          if (rows.some(r => r.url === url)) return { meta: { changes: 0 } };
          rows.push({ source, title, url, category, published_at });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
      bind: (...args) => statement(sql, args),
    };
  }
  return { prepare: (sql) => statement(sql), rows };
}

const recent = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

beforeEach(() => {
  // _dedupCache is module-level state in fetcher-utils.js — reset between
  // tests so one test's cache can't leak into the next.
  clearDedupCache();
});

describe('insertHeadline — without a pre-loaded dedup cache', () => {
  it('inserts a clean, on-topic, recent headline', async () => {
    const db = createFakeD1();
    const ok = await insertHeadline(db, {
      source: 'ESPN',
      title: 'NCAA Adopts New Transfer Portal Eligibility Rule',
      url: 'https://espn.com/story/1',
      category: null,
      published: recent(),
    });
    expect(ok).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].category).toBe('Roster / Portal');
  });

  it('rejects a headline the noise filter catches', async () => {
    const db = createFakeD1();
    const ok = await insertHeadline(db, {
      source: 'Bing News',
      title: 'Alabama vs Georgia: Game Recap and Highlights',
      url: 'https://example.com/recap',
      category: null,
      published: recent(),
    });
    expect(ok).toBe(false);
    expect(db.rows).toHaveLength(0);
  });

  it('rejects a headline older than 7 days regardless of content', async () => {
    const db = createFakeD1();
    const ok = await insertHeadline(db, {
      source: 'ESPN',
      title: 'NCAA Adopts New Transfer Portal Eligibility Rule',
      url: 'https://espn.com/story/stale',
      category: null,
      published: daysAgo(10),
    });
    expect(ok).toBe(false);
    expect(db.rows).toHaveLength(0);
  });

  it('rejects when title or url is missing', async () => {
    const db = createFakeD1();
    expect(await insertHeadline(db, { source: 'ESPN', title: '', url: 'https://espn.com/x', published: recent() })).toBe(false);
    expect(await insertHeadline(db, { source: 'ESPN', title: 'Some Title', url: '', published: recent() })).toBe(false);
    expect(db.rows).toHaveLength(0);
  });

  it('rejects an exact-duplicate title seen via a per-call DB query (no cache)', async () => {
    const db = createFakeD1();
    const first = await insertHeadline(db, {
      source: 'ESPN',
      title: 'Texas Governor Signs NIL Agent Registration Bill',
      url: 'https://espn.com/story/a',
      category: null,
      published: recent(),
    });
    const second = await insertHeadline(db, {
      source: 'CBS Sports',
      title: 'Texas Governor Signs NIL Agent Registration Bill',
      url: 'https://cbssports.com/story/b', // different URL — must be caught by title dedup, not URL uniqueness
      category: null,
      published: recent(),
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.rows).toHaveLength(1);
  });

  it('rejects a reworded duplicate via Jaccard similarity', async () => {
    const db = createFakeD1();
    const first = await insertHeadline(db, {
      source: 'ESPN',
      title: 'Texas Governor Signs New NIL Agent Registration Bill Into Law',
      url: 'https://espn.com/story/c',
      category: null,
      published: recent(),
    });
    const second = await insertHeadline(db, {
      source: 'Yahoo Sports',
      title: 'Texas Governor Signs NIL Agent Registration Bill Into State Law',
      url: 'https://yahoo.com/story/d',
      category: null,
      published: recent(),
    });
    expect(first).toBe(true);
    expect(second).toBe(false); // near-identical wording, high word overlap
    expect(db.rows).toHaveLength(1);
  });

  it('does not dedup two genuinely different stories', async () => {
    const db = createFakeD1();
    const first = await insertHeadline(db, {
      source: 'ESPN',
      title: 'Texas Governor Signs NIL Agent Registration Bill',
      url: 'https://espn.com/story/e',
      category: null,
      published: recent(),
    });
    const second = await insertHeadline(db, {
      source: 'Sportico',
      title: 'College Sports Commission Opens New Investigation',
      url: 'https://sportico.com/story/f',
      category: null,
      published: recent(),
    });
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(db.rows).toHaveLength(2);
  });
});

describe('insertHeadline — with a pre-loaded dedup cache', () => {
  it('keeps the in-memory cache consistent with what was just inserted', async () => {
    const db = createFakeD1();
    await loadDedupCache(db.prepare ? db : db); // empty cache to start
    const first = await insertHeadline(db, {
      source: 'ESPN',
      title: 'Texas Governor Signs NIL Agent Registration Bill',
      url: 'https://espn.com/story/g',
      category: null,
      published: recent(),
    });
    // A second fetcher in the same cron group, still sharing the cache,
    // sees the first fetcher's insert without re-querying the DB.
    const second = await insertHeadline(db, {
      source: 'CBS Sports',
      title: 'Texas Governor Signs NIL Agent Registration Bill',
      url: 'https://cbssports.com/story/h',
      category: null,
      published: recent(),
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.rows).toHaveLength(1);
  });
});
