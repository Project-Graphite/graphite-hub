import { NO_PRESENTATION, presentationProblem, type Presentation } from '../app/presentation.ts';
import { Refused } from '../app/profile.ts';
import type { Bus } from './bus.ts';
import { json, transaction, type Database } from './db.ts';

export function readPresentations(db: Database) {
  return new Map(
    db
      .prepare('SELECT * FROM project_presentation')
      .all()
      .map((row): [string, Presentation] => [
        row.slug as string,
        {
          coverUpload: row.cover_upload as string | null,
          accent: row.accent as string | null,
          summary: row.summary as string | null,
          layout: row.layout as Presentation['layout'],
          feature: { ...NO_PRESENTATION.feature, ...json<object>(row.feature) },
        },
      ]),
  );
}

export function createPresentations(db: Database, bus: Bus) {
  const uploaded = (id: string) =>
    Boolean(db.prepare('SELECT 1 FROM uploads WHERE id = ?').get(id));
  const published = (id: string) =>
    Boolean(db.prepare("SELECT 1 FROM posts WHERE id = ? AND status = 'published'").get(id));

  return {
    read(slug: string): Presentation {
      return readPresentations(db).get(slug) ?? structuredClone(NO_PRESENTATION);
    },

    async save(slug: string, value: Presentation, by: string) {
      const problem = presentationProblem(value, uploaded, published);
      if (problem) {
        throw new Refused(problem);
      }
      const at = new Date().toISOString();
      transaction(db, () => {
        db.prepare(
          `INSERT INTO project_presentation (slug, cover_upload, accent, summary, layout, feature, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (slug) DO UPDATE SET cover_upload = excluded.cover_upload, accent = excluded.accent,
             summary = excluded.summary, layout = excluded.layout, feature = excluded.feature,
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run(
          slug,
          value.coverUpload,
          value.accent,
          value.summary,
          value.layout,
          JSON.stringify(value.feature),
          at,
          by,
        );
        db.prepare(
          "INSERT INTO versions (kind, key, blob, by, at) VALUES ('presentation', ?, ?, ?, ?)",
        ).run(slug, JSON.stringify(value), by, at);
      });
      await bus.publish({
        topic: 'projects',
        key: slug,
        kind: 'presentation',
        public: true,
        actor: by,
        summary: `${slug}'s presentation changed`,
        detail: { slug },
        at,
      });
    },
  };
}

export type Presentations = ReturnType<typeof createPresentations>;
