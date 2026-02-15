-- Migration number: 0003
-- Migration name: seed_projects
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO projects (id, slug, domain, app_url)
VALUES ('skill', 'skill', 'skill.justevery.com', 'https://skill.justevery.com/app');

UPDATE companies
SET project_id = 'skill'
WHERE id = 'acct-justevery'
  AND (project_id IS NULL OR project_id = '' OR project_id = 'skill');
