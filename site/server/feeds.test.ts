import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { atom, escapeXml, rss, type FeedSource } from './feeds.ts';

const source: FeedSource = {
  title: 'Writing — Project Graphite',
  description: 'Posts by the members.',
  siteUrl: 'https://project-graphite.com/blog/',
  feedUrl: 'https://project-graphite.com/blog/feed.xml',
  entries: [
    {
      id: 'p1',
      title: 'Hello <world> & friends',
      summary: 'A first "post".',
      html: '<p>Hi <b>there</b></p>',
      url: 'https://project-graphite.com/amr/blog/hello/',
      publishedAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T11:00:00.000Z',
      author: { name: 'Amr', url: 'https://project-graphite.com/amr/' },
      tags: ['hub', 'c++'],
    },
  ],
};

const wellFormed = (xml: string) => {
  const stack: string[] = [];
  for (const match of xml.matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>/g)) {
    if (match[0].startsWith('<?')) {
      continue;
    }
    if (match[3] === '/') {
      continue;
    }
    if (match[1] === '/') {
      assert.equal(stack.pop(), match[2], `closing ${match[2]}`);
    } else {
      stack.push(match[2]);
    }
  }
  assert.deepEqual(stack, []);
  assert.doesNotMatch(xml.replace(/&(lt|gt|amp|apos|quot);/g, ''), /&/);
};

describe('feeds', () => {
  it('escapes every special character', () => {
    assert.equal(
      escapeXml(`<a href="x">&'</a>`),
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('writes RSS 2.0 with the required channel and item elements', () => {
    const xml = rss(source);
    wellFormed(xml);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
    for (const element of ['title', 'link', 'description', 'lastBuildDate']) {
      assert.match(xml, new RegExp(`<channel>[\\s\\S]*<${element}>`));
    }
    assert.match(
      xml,
      /<atom:link href="https:\/\/project-graphite\.com\/blog\/feed\.xml" rel="self"/,
    );
    assert.match(xml, /<title>Hello &lt;world&gt; &amp; friends<\/title>/);
    assert.match(
      xml,
      /<guid isPermaLink="true">https:\/\/project-graphite\.com\/amr\/blog\/hello\/<\/guid>/,
    );
    assert.match(xml, /<pubDate>Fri, 06 Nov 2026 10:00:00 GMT<\/pubDate>/);
    assert.match(
      xml,
      /<content:encoded>&lt;p&gt;Hi &lt;b&gt;there&lt;\/b&gt;&lt;\/p&gt;<\/content:encoded>/,
    );
    assert.match(xml, /<category>c\+\+<\/category>/);
  });

  it('writes Atom 1.0 with ids, updated stamps, authors and alternate links', () => {
    const xml = atom(source);
    wellFormed(xml);
    assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
    assert.match(xml, /<feed[^>]*>\s*<id>https:\/\/project-graphite\.com\/blog\/<\/id>/);
    assert.match(xml, /<updated>2026-11-06T11:00:00\.000Z<\/updated>\s*<link rel="alternate"/);
    assert.match(xml, /<link rel="self" type="application\/atom\+xml"/);
    assert.match(xml, /<entry>\s*<id>https:\/\/project-graphite\.com\/amr\/blog\/hello\/<\/id>/);
    assert.match(xml, /<published>2026-11-06T10:00:00\.000Z<\/published>/);
    assert.match(
      xml,
      /<author><name>Amr<\/name><uri>https:\/\/project-graphite\.com\/amr\/<\/uri><\/author>/,
    );
    assert.match(xml, /<content type="html">&lt;p&gt;/);
    assert.match(xml, /<category term="hub"\/>/);
  });

  it('dates an empty feed at the epoch rather than now', () => {
    assert.match(atom({ ...source, entries: [] }), /<updated>1970-01-01T00:00:00\.000Z<\/updated>/);
  });
});
