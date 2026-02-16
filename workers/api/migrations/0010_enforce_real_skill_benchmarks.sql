-- Migration number: 0010
-- Migration name: enforce_real_skill_benchmarks
PRAGMA foreign_keys = ON;

DELETE FROM skill_task_scores
WHERE lower(artifact_path) LIKE '%fallback%'
   OR lower(artifact_path) LIKE '%mock%'
   OR lower(artifact_path) LIKE '%synthetic%'
   OR lower(artifact_path) LIKE '%seed%';

DELETE FROM skill_benchmark_runs
WHERE lower(mode) <> 'daytona'
   OR lower(artifact_path) LIKE '%fallback%'
   OR lower(artifact_path) LIKE '%mock%'
   OR lower(artifact_path) LIKE '%synthetic%'
   OR lower(artifact_path) LIKE '%seed%'
   OR lower(notes) LIKE '%fallback%'
   OR lower(notes) LIKE '%mock%'
   OR lower(notes) LIKE '%synthetic%'
   OR lower(notes) LIKE '%seed%';

DELETE FROM skill_task_scores
WHERE run_id NOT IN (SELECT id FROM skill_benchmark_runs);

DROP TRIGGER IF EXISTS trg_skill_runs_daytona_only_insert;
CREATE TRIGGER trg_skill_runs_daytona_only_insert
BEFORE INSERT ON skill_benchmark_runs
FOR EACH ROW
WHEN lower(COALESCE(NEW.mode, '')) <> 'daytona'
BEGIN
  SELECT RAISE(ABORT, 'skill_benchmark_runs.mode must be daytona');
END;

DROP TRIGGER IF EXISTS trg_skill_runs_daytona_only_update;
CREATE TRIGGER trg_skill_runs_daytona_only_update
BEFORE UPDATE ON skill_benchmark_runs
FOR EACH ROW
WHEN lower(COALESCE(NEW.mode, '')) <> 'daytona'
BEGIN
  SELECT RAISE(ABORT, 'skill_benchmark_runs.mode must be daytona');
END;

DROP TRIGGER IF EXISTS trg_skill_runs_no_synthetic_insert;
CREATE TRIGGER trg_skill_runs_no_synthetic_insert
BEFORE INSERT ON skill_benchmark_runs
FOR EACH ROW
WHEN lower(COALESCE(NEW.artifact_path, '')) LIKE '%fallback%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%mock%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%synthetic%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%seed%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%fallback%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%mock%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%synthetic%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%seed%'
BEGIN
  SELECT RAISE(ABORT, 'skill_benchmark_runs cannot contain synthetic markers');
END;

DROP TRIGGER IF EXISTS trg_skill_runs_no_synthetic_update;
CREATE TRIGGER trg_skill_runs_no_synthetic_update
BEFORE UPDATE ON skill_benchmark_runs
FOR EACH ROW
WHEN lower(COALESCE(NEW.artifact_path, '')) LIKE '%fallback%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%mock%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%synthetic%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%seed%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%fallback%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%mock%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%synthetic%'
   OR lower(COALESCE(NEW.notes, '')) LIKE '%seed%'
BEGIN
  SELECT RAISE(ABORT, 'skill_benchmark_runs cannot contain synthetic markers');
END;

DROP TRIGGER IF EXISTS trg_skill_scores_no_synthetic_insert;
CREATE TRIGGER trg_skill_scores_no_synthetic_insert
BEFORE INSERT ON skill_task_scores
FOR EACH ROW
WHEN lower(COALESCE(NEW.artifact_path, '')) LIKE '%fallback%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%mock%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%synthetic%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%seed%'
BEGIN
  SELECT RAISE(ABORT, 'skill_task_scores cannot contain synthetic markers');
END;

DROP TRIGGER IF EXISTS trg_skill_scores_no_synthetic_update;
CREATE TRIGGER trg_skill_scores_no_synthetic_update
BEFORE UPDATE ON skill_task_scores
FOR EACH ROW
WHEN lower(COALESCE(NEW.artifact_path, '')) LIKE '%fallback%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%mock%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%synthetic%'
   OR lower(COALESCE(NEW.artifact_path, '')) LIKE '%seed%'
BEGIN
  SELECT RAISE(ABORT, 'skill_task_scores cannot contain synthetic markers');
END;

