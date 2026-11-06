import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { digestFor, nextDigestAt, spreadDue } from './digest.ts';

describe('digest timing', () => {
  it('finds the next digest day and hour in UTC', () => {
    const friday = Date.parse('2026-11-06T12:00:00.000Z');
    assert.equal(nextDigestAt(friday, 'monday', 8), '2026-11-09T08:00:00.000Z');
    assert.equal(nextDigestAt(friday, 'friday', 13), '2026-11-06T13:00:00.000Z');
    assert.equal(nextDigestAt(friday, 'friday', 8), '2026-11-13T08:00:00.000Z');
    assert.equal(nextDigestAt(friday, 'sunday', 0), '2026-11-08T00:00:00.000Z');
  });

  it('spreads sends across the hour at the configured rate', () => {
    const now = Date.parse('2026-11-09T08:00:00.000Z');
    assert.equal(spreadDue(now, 0, 20), '2026-11-09T08:00:00.000Z');
    assert.equal(spreadDue(now, 1, 20), '2026-11-09T08:03:00.000Z');
    assert.equal(spreadDue(now, 20, 20), '2026-11-09T09:00:00.000Z');
  });
});

describe('digest contents', () => {
  const posts = [
    { id: 'a', author: 'amrmscll', project: 'strata' },
    { id: 'b', author: 'omar', project: null },
    { id: 'c', author: 'amrmscll', project: null },
  ];

  it('keeps the posts a scope covers and nothing for a scope it cannot read', () => {
    assert.deepEqual(digestFor('all', posts), posts);
    assert.deepEqual(
      digestFor('project:strata', posts).map((post) => post.id),
      ['a'],
    );
    assert.deepEqual(
      digestFor('member:amrmscll', posts).map((post) => post.id),
      ['a', 'c'],
    );
    assert.deepEqual(digestFor('member:nobody', posts), []);
    assert.deepEqual(digestFor('garbage', posts), []);
  });
});
