import { mkdir, readdir, readFile, rm, stat, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  await mkdir(dirPath, { recursive: true });
}

async function filesEqual(srcPath, destPath) {
  if (!existsSync(destPath)) return false;
  const [srcStat, destStat] = await Promise.all([stat(srcPath), stat(destPath)]);
  if (srcStat.size !== destStat.size) return false;
  const [srcBuf, destBuf] = await Promise.all([readFile(srcPath), readFile(destPath)]);
  return srcBuf.equals(destBuf);
}

export async function syncDir({ srcDir, destDir, dryRun, force, changed, skipped, notes }) {
  await ensureDir(destDir, dryRun);
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await syncDir({ srcDir: srcPath, destDir: destPath, dryRun, force, changed, skipped, notes });
      continue;
    }
    if (entry.isFile()) {
      const same = !force && (await filesEqual(srcPath, destPath));
      if (same) {
        skipped.push(destPath);
        continue;
      }
      if (dryRun) {
        notes.push(`[dry-run] Would copy ${srcPath} -> ${destPath}`);
      } else {
        await ensureDir(path.dirname(destPath), false);
        await copyFile(srcPath, destPath);
      }
      changed.push(destPath);
    }
  }
}

export async function removeDir(dirPath, dryRun, changed, skipped, notes) {
  if (!existsSync(dirPath)) {
    skipped.push(dirPath);
    return;
  }
  if (dryRun) {
    notes.push(`[dry-run] Would remove ${dirPath}`);
    return;
  }
  await rm(dirPath, { recursive: true, force: true });
  changed.push(dirPath);
}
