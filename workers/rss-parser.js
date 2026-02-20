// ═══════════════════════════════════════════════════════════════════
//  Simple RSS Parser for Cloudflare Workers
//  Workers don't have DOMParser — uses regex on predictable RSS XML.
// ═══════════════════════════════════════════════════════════════════

export function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractText(block, 'title'),
      link: extractText(block, 'link'),
      pubDate: extractText(block, 'pubDate'),
      sourceName: extractText(block, 'source'),
      sourceUrl: extractAttr(block, 'source', 'url'),
      description: extractText(block, 'description'),
    });
  }

  return items;
}

function extractText(xml, tag) {
  // Handle CDATA: <tag><![CDATA[content]]></tag>
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdata) return cdata[1].trim();

  // Handle plain text: <tag>content</tag>
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  if (plain) return plain[1].trim();

  // Handle self-closing or empty
  return '';
}

function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*?${attr}="([^"]*)"[^>]*>`));
  return m ? m[1] : '';
}
