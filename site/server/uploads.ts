import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Refused, UPLOAD_LIMIT, UPLOAD_WIDTHS, type UploadKind } from '../app/profile.ts';
import type { Database } from './db.ts';

const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

export function createUploads(
  db: Database,
  directory: string,
  allow: (owner: string) => Promise<boolean>,
) {
  return {
    async store(owner: string, kind: UploadKind, file: Blob) {
      if (file.size === 0 || file.size > UPLOAD_LIMIT) {
        throw new Refused('Images are up to 5 MB.');
      }
      const input = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(input)
        .metadata()
        .catch(() => undefined);
      if (!metadata?.format || !FORMATS.has(metadata.format)) {
        throw new Refused('Upload a JPEG, PNG, WebP or GIF image.');
      }
      if (!(await allow(owner))) {
        throw new Refused('That is 20 uploads this hour; try again later.');
      }
      const id = randomBytes(12).toString('hex');
      const folder = path.join(directory, id);
      await mkdir(folder, { recursive: true });
      const square = kind === 'avatar';
      const written = [];
      for (const width of UPLOAD_WIDTHS[kind]) {
        const { data, info } = await sharp(input)
          .rotate()
          .resize({
            width,
            height: square ? width : undefined,
            fit: square ? 'cover' : 'inside',
            withoutEnlargement: !square,
          })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        await writeFile(path.join(folder, `${width}.webp`), data);
        written.push(info);
      }
      db.prepare(
        'INSERT INTO uploads (id, owner, kind, mime, bytes, width, height, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        owner,
        kind,
        'image/webp',
        written[0].size,
        written[0].width,
        written[0].height,
        new Date().toISOString(),
      );
      return id;
    },
  };
}

export type Uploads = ReturnType<typeof createUploads>;
