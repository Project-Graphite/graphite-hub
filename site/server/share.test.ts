import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createModel } from '../app/model.ts';
import { shareCard, shareHash, sharePath } from '../app/share.ts';
import type { Directory } from '../app/types.ts';
import { shareSvg, wrap } from './share.ts';

const directory = {
  members: [
    {
      handle: 'amrmscll',
      github: 'AmrMsCLL',
      name: 'Amr',
      accent: '#6f8fd1',
      headline: 'Engineer',
      path: '/members/amrmscll',
    },
  ],
  projects: [
    {
      slug: 'strata',
      parent: null,
      kind: 'project',
      name: 'Strata',
      summary: 'A personal workspace.',
      owner: 'amrmscll',
      url: 'https://strata.project-graphite.com',
      path: '/projects/strata',
    },
  ],
  releases: [],
} as unknown as Directory;

describe('share cards', () => {
  const model = createModel(directory);
  const card = (path: string) => shareCard(model, path, 'Headline', ['#111111']);

  it('maps a project to its name, summary and owner accent, and a member to theirs', () => {
    assert.deepEqual(card('/projects/strata'), {
      label: 'strata.project-graphite.com',
      title: 'Strata',
      subtitle: 'A personal workspace.',
      accent: '#6f8fd1',
    });
    assert.equal(card('/members/amrmscll')?.title, 'Amr');
    assert.equal(card('/')?.title, 'Headline');
    assert.equal(card('/projects/nope'), undefined);
  });

  it('puts a content hash in the image address so a change gets a new address', () => {
    const strata = card('/projects/strata')!;
    assert.equal(
      sharePath('/projects/strata', strata),
      `/share/projects/strata.png?v=${shareHash(strata)}`,
    );
    assert.notEqual(shareHash(strata), shareHash({ ...strata, title: 'Strata 2' }));
    assert.match(sharePath('/', card('/')!), /^\/share\/home\.png\?v=/);
  });
});

describe('share image', () => {
  it('wraps words and ends an overflowing last line with an ellipsis', () => {
    assert.deepEqual(wrap('one two three four', 9, 2), ['one two', 'three…']);
    assert.deepEqual(wrap('short', 20, 3), ['short']);
  });

  it('escapes text so a title cannot break the SVG', () => {
    const svg = shareSvg({ label: 'a', title: '<script>&"', subtitle: 'b', accent: '#6f8fd1' });
    assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
    assert.ok(!svg.includes('<script>'));
  });
});
