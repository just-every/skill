import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface FileWriteOptions {
  checkOnly?: boolean;
}

export interface FileWriteResult {
  path: string;
  changed: boolean;
  skipped: boolean;
}

export async function writeFileIfChanged(
  root: string,
  relativePath: string,
  contents: string,
  options: FileWriteOptions = {}
): Promise<FileWriteResult> {
  const absPath = resolve(root, relativePath);
  const trimmed = ensureTrailingNewline(contents);

  let existing: string | undefined;
  try {
    existing = await fs.readFile(absPath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const changed = existing === undefined ? true : normalizeNewlines(existing) !== trimmed;

  if (options.checkOnly) {
    return { path: absPath, changed, skipped: true };
  }

  if (!changed) {
    return { path: absPath, changed: false, skipped: false };
  }

  await fs.mkdir(dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, trimmed, 'utf8');

  return { path: absPath, changed: true, skipped: false };
}

function ensureTrailingNewline(value: string): string {
  const normalized = normalizeNewlines(value);
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}
