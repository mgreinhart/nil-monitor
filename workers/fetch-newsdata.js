// ═══════════════════════════════════════════════════════════════════
//  NewsData.io Fetcher
//  Fetches NIL/college sports headlines via NewsData.io API.
//  Requires secret: wrangler secret put NEWSDATA_KEY
// ═══════════════════════════════════════════════════════════════════

const BASE_URL = 'https://newsdata.io/api/1/latest';

const QUERIES = [
  'NIL college sports',
  'NCAA governance OR NCAA rules',
  'college sports commission OR CSC enforcement',
  'college athlete lawsuit OR NCAA litigation',
  'NIL legislation OR college athlete bill',
];

function buildUrl(apiKey, query) {
  const params = new URLSearchParams({
    apikey: apiKey,
    q: query,
    language: 'en',
    country: 'us',
    category: 'sports',
    removeduplicate: '1',
    timeframe: '6',
    size: '10',
  });
  return `${BASE_URL}?${params}`;
}

export async function fetchNewsData(env) {
  const apiKey = env.NEWSDATA_KEY;
  if (!apiKey) {
    console.log('NewsData.io: no API key configured, skipping');
    return;
  }

  console.log('Fetching NewsData.io headlines...');
  let totalInserted = 0;

  for (const q of QUERIES) {
    try {
      const resp = await fetch(buildUrl(apiKey, q));
      if (!resp.ok) {
        console.error(`NewsData.io fetch failed for "${q}": ${resp.status}`);
        continue;
      }

      const data = await resp.json();

      if (data.status !== 'success' || !data.results) {
        console.error(`NewsData.io error for "${q}": ${data.status}`);
        continue;
      }

      for (const article of data.results) {
        if (!article.title || !article.link) continue;

        const source = article.source_name || article.source_id || 'NewsData.io';
        const published = article.pubDate
          ? new Date(article.pubDate).toISOString()
          : new Date().toISOString();

        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO headlines (source, title, url, published_at)
             VALUES (?, ?, ?, ?)`
          ).bind(source, article.title, article.link, published).run();
          totalInserted++;
        } catch (e) {
          // UNIQUE constraint on url — skip duplicates silently
        }
      }
    } catch (err) {
      console.error(`NewsData.io error for "${q}":`, err.message);
    }
  }

  console.log(`NewsData.io: inserted ${totalInserted} headlines`);
}
