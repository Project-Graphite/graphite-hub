import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { metaFor, metaTags, ORIGIN } from '../app/meta.ts';
import { createModel, publicDirectory } from '../app/model.ts';
import { structuredData } from '../app/structured-data.ts';
import type { Directory } from '../app/types.ts';

const directory = {
  members: [
    {
      handle: 'amrmscll',
      alias: 'amr',
      github: 'AmrMsCLL',
      name: 'Amr',
      listed: true,
      headline: 'Software engineer.',
      bio: null,
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      accent: '#6f8fd1',
      path: '/amr',
    },
    {
      handle: 'omar-mohamed24',
      alias: null,
      github: 'Omar-Mohamed24',
      name: 'Omar',
      listed: true,
      headline: null,
      bio: null,
      avatarUrl: '/uploads/avatar/a1.webp',
      accent: '#c9a15f',
      path: '/members/omar-mohamed24',
    },
    {
      handle: 'ghost',
      alias: null,
      github: 'Ghost',
      name: 'Ghost',
      listed: false,
      headline: null,
      bio: null,
      avatarUrl: 'https://avatars.githubusercontent.com/u/3',
      accent: '#8fb86a',
      path: '/members/ghost',
    },
  ],
  projects: [
    {
      slug: 'strata',
      parent: null,
      kind: 'project',
      name: 'Strata',
      summary: 'A personal workspace.',
      tags: ['react', 'nestjs'],
      repoUrl: 'https://github.com/Project-Graphite/strata',
      owner: 'amrmscll',
      authors: ['AmrMsCLL', 'Omar-Mohamed24'],
      status: 'live',
      url: 'https://strata.project-graphite.com',
      path: '/strata',
    },
    {
      slug: 'windhawk-mods',
      parent: null,
      kind: 'epic',
      name: 'Windhawk mods',
      summary: 'Mods for the Windows 11 taskbar.',
      tags: [],
      repoUrl: 'https://github.com/Project-Graphite/windhawk-mods',
      owner: 'amrmscll',
      authors: ['AmrMsCLL'],
      status: 'source-only',
      url: null,
      path: '/windhawk-mods',
    },
    {
      slug: 'tasktune',
      parent: 'windhawk-mods',
      kind: 'project',
      name: 'TaskTune',
      summary: 'A media player in the taskbar.',
      tags: ['c++'],
      repoUrl: 'https://github.com/Project-Graphite/windhawk-mods',
      owner: 'amrmscll',
      authors: ['AmrMsCLL'],
      status: 'source-only',
      url: null,
      path: '/windhawk-mods/tasktune',
    },
  ],
  releases: [{ id: 'r1', project: 'strata', version: '1.2.0', date: '2026-11-10' }],
  posts: [
    {
      id: 'p1',
      slug: 'hello',
      title: 'Hello',
      summary: 'A first post.',
      author: 'amrmscll',
      project: 'strata',
      tags: ['hub'],
      coverUrl: null,
      publishedAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-07T09:00:00.000Z',
      readingMinutes: 4,
      path: '/amr/blog/hello',
    },
    {
      id: 'p2',
      slug: 'unseen',
      title: 'Unseen',
      summary: '',
      author: 'ghost',
      project: null,
      tags: [],
      coverUrl: null,
      publishedAt: '2026-11-08T10:00:00.000Z',
      updatedAt: '2026-11-08T10:00:00.000Z',
      readingMinutes: 1,
      path: '/members/ghost/blog/unseen',
    },
  ],
} as unknown as Directory;

const model = createModel(directory);
const page = (path: string) => metaFor(model, path, 'Software built in the open.');
const graph = (path: string) =>
  structuredData(model, page(path), `${ORIGIN}/share${path}.png`)?.['@graph'] as
    Record<string, unknown>[] | undefined;
const typed = (path: string, type: string) => graph(path)?.find((node) => node['@type'] === type);

describe('page addresses', () => {
  it('gives every page one unslashed canonical address', () => {
    for (const path of [
      '/members',
      '/projects',
      '/epics',
      '/changelog',
      '/status',
      '/messages',
      '/subscribe',
      '/privacy',
      '/blog',
      '/strata',
      '/windhawk-mods/tasktune',
      '/amr',
      '/members/omar-mohamed24',
      '/amr/blog',
      '/amr/blog/hello',
      '/changelog/projects/strata',
      '/changelog/epics/windhawk-mods/tasktune',
      '/changelog/members/amrmscll',
    ]) {
      assert.equal(page(path).canonical, `${ORIGIN}${path}`, path);
      assert.equal(page(`${path}/`).canonical, `${ORIGIN}${path}`, `${path}/`);
    }
    assert.equal(page('/').canonical, `${ORIGIN}/`);
  });

  it('keeps search, the admin, the kit, the editors and the member pages out of the index', () => {
    for (const path of [
      '/search',
      '/admin',
      '/kit',
      '/blog/new',
      '/blog/mine',
      '/blog/p1/edit',
      '/amr/edit',
      '/members/omar-mohamed24/edit',
      '/subscribe/manage/abc/def',
      '/sign-in',
      '/nobody',
    ]) {
      assert.equal(page(path).noindex, true, path);
    }
    for (const path of ['/', '/members', '/strata', '/amr', '/amr/blog/hello']) {
      assert.equal(page(path).noindex, undefined, path);
    }
  });

  it('titles a page that does not exist as not found, whatever its address', () => {
    assert.equal(page('/sign-in').title, 'Not found — Project Graphite');
    assert.equal(page('/changelog/members/nobody').title, 'Not found — Project Graphite');
  });

  it('writes a noindex page without a canonical link, and an indexable one with it', () => {
    const tags = (path: string) => metaTags(page(path), undefined);
    assert.ok(tags('/search').some((tag) => 'name' in tag && tag.name === 'robots'));
    assert.ok(!tags('/search').some((tag) => 'rel' in tag && tag.rel === 'canonical'));
    assert.ok(tags('/strata').some((tag) => 'rel' in tag && tag.href === `${ORIGIN}/strata`));
    assert.ok(!tags('/strata').some((tag) => 'name' in tag && tag.name === 'robots'));
  });

  it('adds the headline to the home title and composes a description for every member', () => {
    assert.equal(page('/').title, 'Project Graphite — Software built in the open');
    assert.equal(
      page('/amr').description,
      'Software engineer. Builds Windhawk mods and Strata at Project Graphite.',
    );
    assert.equal(
      page('/members/omar-mohamed24').description,
      'Omar builds Strata at Project Graphite.',
    );
    assert.equal(page('/members/ghost').description, 'Ghost is a member of Project Graphite.');
  });

  it('types a post as an article with its dates and a member as a profile', () => {
    const property = (path: string, name: string) =>
      metaTags(page(path), { path: '/share/x.png', alt: 'Hello. A first post.' }).find(
        (tag) => 'property' in tag && tag.property === name,
      ) as { content: string } | undefined;
    assert.equal(property('/amr/blog/hello', 'og:type')?.content, 'article');
    assert.equal(
      property('/amr/blog/hello', 'article:published_time')?.content,
      '2026-11-06T10:00:00.000Z',
    );
    assert.equal(
      property('/amr/blog/hello', 'article:modified_time')?.content,
      '2026-11-07T09:00:00.000Z',
    );
    assert.equal(property('/amr/blog/hello', 'og:image:alt')?.content, 'Hello. A first post.');
    assert.equal(property('/amr', 'og:type')?.content, 'profile');
    assert.equal(property('/strata', 'og:type')?.content, 'website');
    assert.equal(property('/strata', 'og:locale')?.content, 'en_GB');
  });
});

describe('structured data', () => {
  it('describes the organisation and the site on the home page', () => {
    const organisation = typed('/', 'Organization')!;
    assert.equal(organisation['@id'], `${ORIGIN}/#organization`);
    assert.equal(organisation.logo, `${ORIGIN}/apple-touch-icon.png`);
    assert.deepEqual(
      (organisation.member as { name: string }[]).map((member) => member.name),
      ['Amr', 'Omar'],
    );
    assert.deepEqual(typed('/', 'WebSite')!.publisher, { '@id': `${ORIGIN}/#organization` });
  });

  it('describes a member as a profile page about a person', () => {
    const profile = typed('/members/omar-mohamed24', 'ProfilePage')!;
    const person = profile.mainEntity as Record<string, unknown>;
    assert.equal(profile.url, `${ORIGIN}/members/omar-mohamed24`);
    assert.equal(person['@type'], 'Person');
    assert.equal(person.image, `${ORIGIN}/uploads/avatar/a1.webp`);
    assert.deepEqual(person.sameAs, ['https://github.com/Omar-Mohamed24']);
  });

  it('describes a live project as a web application built from its source', () => {
    const app = typed('/strata', 'WebApplication')!;
    const source = typed('/strata', 'SoftwareSourceCode')!;
    assert.equal(app.url, 'https://strata.project-graphite.com');
    assert.equal(app.softwareVersion, '1.2.0');
    assert.equal(source.codeRepository, 'https://github.com/Project-Graphite/strata');
    assert.deepEqual(source.targetProduct, { '@id': app['@id'] });
    assert.deepEqual(
      (source.author as { name: string }[]).map((author) => author.name),
      ['Amr', 'Omar'],
    );
  });

  it('describes a source-only project as source code alone', () => {
    assert.equal(typed('/windhawk-mods/tasktune', 'WebApplication'), undefined);
    assert.equal(
      typed('/windhawk-mods/tasktune', 'SoftwareSourceCode')!.codeRepository,
      'https://github.com/Project-Graphite/windhawk-mods',
    );
    assert.deepEqual(
      (typed('/windhawk-mods', 'SoftwareSourceCode')!.hasPart as { name: string }[]).map(
        (part) => part.name,
      ),
      ['TaskTune'],
    );
  });

  it('describes a post as a blog posting with its author, dates and image', () => {
    const post = typed('/amr/blog/hello', 'BlogPosting')!;
    assert.equal(post.headline, 'Hello');
    assert.equal(post.datePublished, '2026-11-06T10:00:00.000Z');
    assert.equal(post.dateModified, '2026-11-07T09:00:00.000Z');
    assert.equal(post.image, `${ORIGIN}/share/amr/blog/hello.png`);
    assert.equal((post.author as { url: string }).url, `${ORIGIN}/amr`);
  });

  it('gives every nested page its trail, with absolute addresses', () => {
    const trail = (path: string) =>
      (typed(path, 'BreadcrumbList')!.itemListElement as { name: string; item: string }[]).map(
        ({ name, item }) => [name, item],
      );
    assert.deepEqual(trail('/windhawk-mods/tasktune'), [
      ['Project Graphite', `${ORIGIN}/`],
      ['Epics', `${ORIGIN}/epics`],
      ['Windhawk mods', `${ORIGIN}/windhawk-mods`],
      ['TaskTune', `${ORIGIN}/windhawk-mods/tasktune`],
    ]);
    assert.deepEqual(trail('/amr/blog/hello').at(-2), ['Amr', `${ORIGIN}/amr/blog`]);
    assert.deepEqual(trail('/changelog/projects/strata').at(-1), [
      'Strata',
      `${ORIGIN}/changelog/projects/strata`,
    ]);
    assert.deepEqual(trail('/amr').at(1), ['Members', `${ORIGIN}/members`]);
  });

  it('writes nothing for a page kept out of the index or one with no subject', () => {
    assert.equal(graph('/search'), undefined);
    assert.equal(graph('/nobody'), undefined);
    assert.equal(graph('/privacy'), undefined);
  });

  it('never writes a relative address', () => {
    for (const path of ['/', '/amr', '/strata', '/windhawk-mods', '/amr/blog/hello']) {
      assert.doesNotMatch(JSON.stringify(graph(path)), /"(url|item|image|@id)":"\//, path);
    }
  });
});

describe('what a visitor is sent', () => {
  it('leaves out unlisted members and their writing', () => {
    const visible = publicDirectory(directory);
    assert.deepEqual(
      visible.members.map((member) => member.handle),
      ['amrmscll', 'omar-mohamed24'],
    );
    assert.deepEqual(
      visible.posts.map((post) => post.id),
      ['p1'],
    );
    assert.equal(visible.projects, directory.projects);
    assert.doesNotMatch(JSON.stringify(visible), /ghost/i);
  });
});
