import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentSecurityPolicy } from './headers.ts';

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
