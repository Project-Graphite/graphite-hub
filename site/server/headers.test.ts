import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentSecurityPolicy, securityHeaders, unslashed } from './headers.ts';

describe('content security policy', () => {
  const policy = new Map(
    contentSecurityPolicy('abc')
      .split('; ')
      .map((directive) => {
        const [name, ...sources] = directive.split(' ');
        return [name, sources] as const;
      }),
  );

  it('allows inline style attributes, which carry accents and positions in the server render', () => {
    assert.deepEqual(policy.get('style-src-attr'), ["'unsafe-inline'"]);
  });

  it('keeps scripts and style elements to the request nonce', () => {
    assert.deepEqual(policy.get('script-src'), ["'self'", "'nonce-abc'"]);
    assert.deepEqual(policy.get('style-src'), ["'self'", "'nonce-abc'"]);
  });
});

function visit(
  middleware: typeof unslashed,
  url: string,
  method = 'GET',
): { status?: number; location?: string; headers: Record<string, string>; passed: boolean } {
  const seen = { headers: {} as Record<string, string>, passed: false };
  middleware(
    { method, originalUrl: url, path: url.split('?')[0] } as never,
    {
      setHeader: (name: string, value: string) => {
        seen.headers[name] = value;
      },
      redirect: (status: number, location: string) => Object.assign(seen, { status, location }),
    } as never,
    () => {
      seen.passed = true;
    },
  );
  return seen;
}

describe('one address per page', () => {
  it('moves a trailing slash to the address without it, keeping the query', () => {
    assert.deepEqual(
      [visit(unslashed, '/members/').status, visit(unslashed, '/members/').location],
      [301, '/members'],
    );
    assert.equal(visit(unslashed, '/members/amrmscll/?edit').location, '/members/amrmscll?edit');
    assert.equal(visit(unslashed, '/blog//').location, '/blog');
  });

  it('never redirects off the site', () => {
    assert.equal(visit(unslashed, '//evil.example/').location, '/evil.example');
    assert.equal(visit(unslashed, '/\\evil.example/').location, '/evil.example');
    assert.equal(visit(unslashed, '///').location, '/');
  });

  it('leaves the home page, unslashed addresses and writes alone', () => {
    assert.ok(visit(unslashed, '/').passed);
    assert.ok(visit(unslashed, '/members').passed);
    assert.ok(visit(unslashed, '/members?next=/blog/').passed);
    assert.ok(visit(unslashed, '/messages/', 'POST').passed);
  });
});

describe('response headers', () => {
  it('keeps loader data out of search indexes and leaves pages indexable', () => {
    assert.equal(visit(securityHeaders, '/strata.data').headers['X-Robots-Tag'], 'noindex');
    assert.equal(
      visit(securityHeaders, '/_root.data?_routes=root').headers['X-Robots-Tag'],
      'noindex',
    );
    assert.equal(visit(securityHeaders, '/strata').headers['X-Robots-Tag'], undefined);
    assert.ok(visit(securityHeaders, '/strata').passed);
  });
});
