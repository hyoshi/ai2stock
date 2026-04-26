import fs from 'node:fs';
import path from 'node:path';
import type { Atom, ObsidianConfig } from '../../core/types.js';

export function updateProjectMoc(atom: Atom, cfg: ObsidianConfig): boolean {
  const project = atom.frontmatter.project;
  if (!project) return false;

  const safeProject = project.replace(/[/\\:*?"<>|]/g, '-').replace(/\.+/g, '_');
  const mocDir = path.join(cfg.vault_path, cfg.folders.moc, 'projects');
  fs.mkdirSync(mocDir, { recursive: true });
  const mocPath = path.join(mocDir, `${safeProject}.md`);
  const resolvedMocDir = path.resolve(mocDir);
  const resolvedMocPath = path.resolve(mocPath);
  if (!resolvedMocPath.startsWith(resolvedMocDir + path.sep)) {
    throw new Error(`Refusing to write MOC outside its directory: ${safeProject}`);
  }

  const entry = `- ${atom.frontmatter.created.slice(0, 10)} [${atom.frontmatter.type}] [[${atom.frontmatter.id}]] — ${atom.title}`;

  if (!fs.existsSync(mocPath)) {
    const header = [
      `# ${project} — Atoms Index`,
      '',
      '> 自動生成されたMOC（Map of Content）。`ai2stock` が同プロジェクトのAtomを順次追記。',
      '',
      '## Atoms',
      '',
      entry,
      '',
    ].join('\n');
    fs.writeFileSync(mocPath, header, 'utf8');
    return true;
  }

  const content = fs.readFileSync(mocPath, 'utf8');
  if (content.includes(`[[${atom.frontmatter.id}]]`)) {
    return true;
  }

  const updated = content.endsWith('\n') ? content + entry + '\n' : content + '\n' + entry + '\n';
  fs.writeFileSync(mocPath, updated, 'utf8');
  return true;
}
