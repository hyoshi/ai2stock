import fs from 'node:fs';
import path from 'node:path';

export function writeFileAtomic(filePath: string, text: string): void {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, text, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw new Error(`Failed to write ${filePath}: ${(e as Error).message}`);
  }
}

export function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function isInsideDir(filePath: string, dir: string): boolean {
  const realDir = safeRealpath(dir);
  const parent = path.dirname(filePath);
  const realParent = safeRealpath(parent);
  const realFile = path.join(realParent, path.basename(filePath));
  return realFile === realDir || realFile.startsWith(realDir + path.sep);
}
