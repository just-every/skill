import { mkdir, readdir, readFile, rm, stat, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  await mkdir(dirPath, { recursive: true });
}

function renderTemplate(contents, tokens) {
  if (!tokens || Object.keys(tokens).length === 0) return contents;
  let out = contents;
  for (const [key, value] of Object.entries(tokens)) {
    const safeValue = String(value ?? '');
    out = out.replaceAll(`{{${key}}}`, safeValue);
  }
  return out;
}

function shouldRenderTemplateFile(fileName) {
  return fileName === 'SKILL.md';
}

async function filesEqual(srcPath, destPath) {
  if (!existsSync(destPath)) return false;
  const [srcStat, destStat] = await Promise.all([stat(srcPath), stat(destPath)]);
  if (srcStat.size !== destStat.size) return false;
  const [srcBuf, destBuf] = await Promise.all([readFile(srcPath), readFile(destPath)]);
  return srcBuf.equals(destBuf);
}

export async function syncDir({ srcDir, destDir, dryRun, force, changed, skipped, notes, tokens }) {
  await ensureDir(destDir, dryRun);
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await syncDir({ srcDir: srcPath, destDir: destPath, dryRun, force, changed, skipped, notes, tokens });
      continue;
    }
    if (entry.isFile()) {
      if (shouldRenderTemplateFile(entry.name)) {
        const raw = await readFile(srcPath, 'utf8');
        const rendered = renderTemplate(raw, tokens);
        const exists = existsSync(destPath);
        if (!force && exists) {
          const current = await readFile(destPath, 'utf8');
          if (current === rendered) {
            skipped.push(destPath);
            continue;
          }
        }
        if (dryRun) {
          notes.push(`[dry-run] Would render ${srcPath} -> ${destPath}`);
        } else {
          await ensureDir(path.dirname(destPath), false);
          await writeFile(destPath, rendered, 'utf8');
        }
        changed.push(destPath);
      } else {
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
