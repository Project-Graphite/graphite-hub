ALTER TABLE projects ADD COLUMN name TEXT;
ALTER TABLE projects ADD COLUMN summary TEXT;
ALTER TABLE projects ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN status TEXT CHECK (status IN ('live', 'wip', 'archived', 'source-only'));
ALTER TABLE projects ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN pin_order INTEGER;
ALTER TABLE projects ADD COLUMN showcase TEXT;
ALTER TABLE projects ADD COLUMN owner TEXT;
ALTER TABLE projects ADD COLUMN authors TEXT NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN edited_at TEXT;
ALTER TABLE projects ADD COLUMN edited_by TEXT;
ALTER TABLE projects ADD COLUMN removed_at TEXT;
ALTER TABLE members ADD COLUMN left_at TEXT;
ALTER TABLE profiles ADD COLUMN name TEXT;
ALTER TABLE uploads ADD COLUMN unreferenced_at TEXT;

UPDATE projects SET
  name = json_extract(entry, '$.name'),
  summary = trim(json_extract(entry, '$.summary'), char(10) || char(13) || ' '),
  tags = coalesce(json_extract(entry, '$.tags'), '[]'),
  status = json_extract(entry, '$.status'),
  listed = coalesce(json_extract(entry, '$.listed'), 1),
  pin_order = CASE WHEN json_extract(entry, '$.pinned') THEN 0 END,
  showcase = json_extract(entry, '$.showcase'),
  owner = json_extract(entry, '$.owner'),
  authors = coalesce(json_extract(entry, '$.authors'), '[]');

UPDATE projects SET
  name = coalesce((SELECT json_extract(fields, '$.name') FROM registry_pending p WHERE p.slug = projects.slug), name),
  summary = coalesce((SELECT json_extract(fields, '$.summary') FROM registry_pending p WHERE p.slug = projects.slug), summary),
  tags = coalesce((SELECT json_extract(fields, '$.tags') FROM registry_pending p WHERE p.slug = projects.slug), tags),
  status = coalesce((SELECT json_extract(fields, '$.status') FROM registry_pending p WHERE p.slug = projects.slug), status),
  listed = coalesce((SELECT json_extract(fields, '$.listed') FROM registry_pending p WHERE p.slug = projects.slug), listed),
  pin_order = CASE (SELECT json_extract(fields, '$.pinned') FROM registry_pending p WHERE p.slug = projects.slug)
    WHEN 1 THEN 0 WHEN 0 THEN NULL ELSE pin_order END
WHERE slug IN (SELECT slug FROM registry_pending);

UPDATE projects SET summary = (SELECT summary FROM project_presentation pp WHERE pp.slug = projects.slug)
WHERE slug IN (SELECT slug FROM project_presentation WHERE summary IS NOT NULL);

CREATE INDEX activity_console ON activity (kind, id) WHERE public = 1;
