import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaults, problem } from '../app/settings.ts';
import { createSettings, SettingRefused } from './settings.ts';
import { accentsFor } from './snapshot.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

describe('setting validation', () => {
  it('accepts every default', () => {
    for (const [key, value] of Object.entries(defaults())) {
      assert.equal(problem(key as keyof ReturnType<typeof defaults>, value), null, key);
    }
  });

  it('refuses values outside each kind', () => {
    assert.match(problem('home.timeline.days', 3)!, /14 to 365/);
    assert.match(problem('home.timeline.days', 30.5)!, /whole number/);
    assert.match(problem('site.name', '')!, /1 to 40/);
    assert.match(problem('home.sections', [{ id: 'hero', on: true }])!, /once/);
    assert.match(problem('home.ticker.kinds', ['deploy', 'deploy'])!, /may only contain/);
    assert.match(problem('site.accents', ['#fff', 'red', '#000000'])!, /colours/);
  });
});

describe('settings', () => {
  it('stores a valid value, records its version and publishes the change', async () => {
    const db = memoryDatabase();
    const { bus, published } = recordingBus();
    const settings = createSettings(db, bus);
    const reordered = [...defaults()['home.sections']].reverse();

    await settings.set('home.sections', reordered, 'amrmscll');

    assert.deepEqual(settings.get()['home.sections'], reordered);
    assert.equal(settings.history('home.sections').length, 1);
    assert.deepEqual(
      published.map((event) => [event.topic, event.key]),
      [['settings', 'home']],
    );
  });

  it('refuses unknown keys and invalid values without storing them', async () => {
    const settings = createSettings(memoryDatabase(), recordingBus().bus);
    await assert.rejects(settings.set('home.nope', 1, 'amrmscll'), SettingRefused);
    await assert.rejects(settings.set('home.more.count', 99, 'amrmscll'), SettingRefused);
    assert.equal(settings.get()['home.more.count'], defaults()['home.more.count']);
  });

  it('reverts to an earlier version as a new version', async () => {
    const settings = createSettings(memoryDatabase(), recordingBus().bus);
    await settings.set('home.featured.count', 2, 'amrmscll');
    await settings.set('home.featured.count', 5, 'amrmscll');
    const [, first] = settings.history('home.featured.count');

    await settings.revert(first.id, 'amrmscll');

    assert.equal(settings.get()['home.featured.count'], 2);
    assert.equal(settings.history('home.featured.count').length, 3);
  });
});

describe('member accents', () => {
  it('keeps chosen accents and gives the rest the next unused colours in order', () => {
    const accents = accentsFor(
      ['amrmscll', 'abdallah', 'zed'],
      new Map([['amrmscll', '#6f8fd1']]),
      ['#6f8fd1', '#c9a15f', '#8fb86a'],
    );
    assert.deepEqual(Object.fromEntries(accents), {
      amrmscll: '#6f8fd1',
      abdallah: '#c9a15f',
      zed: '#8fb86a',
    });
  });
});
