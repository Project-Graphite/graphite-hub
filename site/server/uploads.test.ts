import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import sharp from 'sharp';
import { Refused } from '../app/profile.ts';
import { createUploads } from './uploads.ts';
import { memoryDatabase } from './testing.ts';

const directory = mkdtempSync(path.join(tmpdir(), 'hub-uploads-'));
after(() => rmSync(directory, { recursive: true, force: true }));

async function jpeg(width: number, height: number) {
  const data = await sharp({
    create: { width, height, channels: 3, background: '#6f8fd1' },
  })
    .jpeg()
    .withExifMerge({ IFD0: { Copyright: 'secret camera' } })
    .toBuffer();
  return new Blob([new Uint8Array(data)], { type: 'image/jpeg' });
}

describe('uploads', () => {
  it('writes WebP in two widths without metadata and records the upload', async () => {
    const db = memoryDatabase();
    const uploads = createUploads(db, directory, async () => true);
    const id = await uploads.store('amrmscll', 'cover', await jpeg(2400, 1200));
    const small = await sharp(readFileSync(path.join(directory, id, '800.webp'))).metadata();
    const largeMeta = await sharp(readFileSync(path.join(directory, id, '1600.webp'))).metadata();
    assert.equal(largeMeta.format, 'webp');
    assert.equal(largeMeta.width, 1600);
    assert.equal(largeMeta.exif, undefined);
    assert.equal(small.width, 800);
    const row = db.prepare('SELECT owner, kind, width FROM uploads WHERE id = ?').get(id);
    assert.deepEqual({ ...row }, { owner: 'amrmscll', kind: 'cover', width: 1600 });
  });

  it('crops avatars square', async () => {
    const uploads = createUploads(memoryDatabase(), directory, async () => true);
    const id = await uploads.store('amrmscll', 'avatar', await jpeg(300, 200));
    const meta = await sharp(readFileSync(path.join(directory, id, '96.webp'))).metadata();
    assert.deepEqual([meta.width, meta.height], [96, 96]);
  });

  it('refuses what is not an image, what is too large and what is over the hourly limit', async () => {
    const open = createUploads(memoryDatabase(), directory, async () => true);
    await assert.rejects(
      open.store('amrmscll', 'cover', new Blob(['<svg/>'], { type: 'image/png' })),
      Refused,
    );
    await assert.rejects(
      open.store('amrmscll', 'cover', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)])),
      /5 MB/,
    );
    const limited = createUploads(memoryDatabase(), directory, async () => false);
    await assert.rejects(limited.store('amrmscll', 'cover', await jpeg(10, 10)), /20 uploads/);
  });
});
