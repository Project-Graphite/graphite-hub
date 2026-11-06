export interface FeedEntry {
  id: string;
  title: string;
  summary: string;
  html: string;
  url: string;
  publishedAt: string;
  updatedAt: string;
  author: { name: string; url: string };
  tags: string[];
}

export interface FeedSource {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  entries: FeedEntry[];
}

export function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

const latest = (entries: FeedEntry[], fallback: string) =>
  entries.reduce((last, entry) => (entry.updatedAt > last ? entry.updatedAt : last), fallback);

export function rss({ title, description, siteUrl, feedUrl, entries }: FeedSource) {
  const items = entries.map((entry) =>
    [
      '    <item>',
      `      <title>${escapeXml(entry.title)}</title>`,
      `      <link>${escapeXml(entry.url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(entry.url)}</guid>`,
      `      <pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>`,
      `      <dc:creator>${escapeXml(entry.author.name)}</dc:creator>`,
      `      <description>${escapeXml(entry.summary)}</description>`,
      `      <content:encoded>${escapeXml(entry.html)}</content:encoded>`,
      ...entry.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
      '    </item>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    '    <language>en</language>',
    `    <lastBuildDate>${new Date(latest(entries, new Date(0).toISOString())).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

export function atom({ title, description, siteUrl, feedUrl, entries }: FeedSource) {
  const items = entries.map((entry) =>
    [
      '  <entry>',
      `    <id>${escapeXml(entry.url)}</id>`,
      `    <title>${escapeXml(entry.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(entry.url)}"/>`,
      `    <published>${entry.publishedAt}</published>`,
      `    <updated>${entry.updatedAt}</updated>`,
      `    <author><name>${escapeXml(entry.author.name)}</name><uri>${escapeXml(entry.author.url)}</uri></author>`,
      `    <summary>${escapeXml(entry.summary)}</summary>`,
      `    <content type="html">${escapeXml(entry.html)}</content>`,
      ...entry.tags.map((tag) => `    <category term="${escapeXml(tag)}"/>`),
      '  </entry>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(siteUrl)}</id>`,
    `  <title>${escapeXml(title)}</title>`,
    `  <subtitle>${escapeXml(description)}</subtitle>`,
    `  <updated>${latest(entries, new Date(0).toISOString())}</updated>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(siteUrl)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}"/>`,
    ...items,
    '</feed>',
    '',
  ].join('\n');
}
