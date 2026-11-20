import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync, readSync, opendirSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep, parse, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { JobError } from '@/motor/jobs/jobs.errors';

const denied = (message: string): never => { throw new JobError('JOB_WORKSPACE_DENIED', message); };
const same = (a: { dev: number; ino: number }, b: { dev: number; ino: number }) => a.dev === b.dev && a.ino === b.ino;

/** Local IO guard, not an OS sandbox against hostile concurrent filesystem mutation. */
export class WorkspacePolicy {
  readonly root: string;
  private readonly rootIdentity;
  constructor(root: string) {
    if (!isAbsolute(root)) denied('Workspace root must be an absolute host configuration');
    this.root = realpathSync(root);
    if (this.root === parse(this.root).root || this.root === realpathSync(homedir())) denied('Workspace root is too broad');
    this.rootIdentity = lstatSync(this.root);
    if (!this.rootIdentity.isDirectory()) denied('Workspace root must be a directory');
  }

  authorizeCwd(cwd: string): string {
    if (!isAbsolute(cwd)) denied('Job cwd must be absolute');
    const path = this.checked(this.root, cwd);
    if (!lstatSync(path).isDirectory()) denied('Job cwd is not a directory');
    return path;
  }

  read(cwd: string, input: string, remainingBytes = 256 * 1024) {
    const limit = Math.min(256 * 1024, remainingBytes);
    if (!Number.isSafeInteger(limit) || limit < 0) denied('Invalid remaining read budget');
    const path = this.checked(cwd, input);
    const before = lstatSync(path);
    if (!before.isFile()) denied('Only ordinary text files can be read');
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      if (!same(before, opened) || !opened.isFile() || opened.size > limit) denied('File identity or remaining size budget is not allowed');
      this.checked(cwd, input);
      if (!same(opened, lstatSync(path))) denied('File changed during authorization');
      const buffer = Buffer.alloc(limit + 1);
      let length = 0, count: number;
      do { count = readSync(fd, buffer, length, buffer.length - length, null); length += count; }
      while (count && length < buffer.length);
      const after = fstatSync(fd);
      this.checked(cwd, input);
      if (length > limit || !same(after, lstatSync(path)) || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) {
        denied('File changed while reading or exceeded its size budget');
      }
      const data = buffer.subarray(0, length);
      if (data.includes(0)) denied('Binary file reads are not supported');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      return { text, bytes: length, evidence: { path: relative(this.root, path), startLine: 1,
        endLine: Math.max(1, text.split('\n').length - (text.endsWith('\n') ? 1 : 0)),
        contentHash: createHash('sha256').update(data).digest('hex') } };
    } finally { closeSync(fd); }
  }

  list(cwd: string, input: string): string[] {
    const path = this.checked(cwd, input);
    const before = lstatSync(path);
    if (!before.isDirectory()) denied('Only ordinary directories can be listed');
    const directory = opendirSync(path);
    try {
      const entries: string[] = [];
      let entry;
      while ((entry = directory.readSync())) {
        if (entries.length >= 500) denied('Directory entry budget exceeded');
        entries.push(`${entry.name}${entry.isSymbolicLink() ? ' [symlink: blocked]' : entry.isDirectory() ? '/' : ''}`);
      }
      this.checked(cwd, input);
      if (!same(before, lstatSync(path))) denied('Directory changed during enumeration');
      return entries.sort();
    } finally { directory.closeSync(); }
  }

  private checked(cwd: string, input: string): string {
    if (typeof input !== 'string' || !input || input.includes('\0')) denied('Invalid workspace path');
    const path = resolve(cwd, input);
    const inside = relative(this.root, path);
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) denied('Path is outside the authorized workspace');
    const rootNow = lstatSync(this.root);
    if (rootNow.isSymbolicLink() || !same(rootNow, this.rootIdentity)) denied('Workspace root identity changed');
    let current = this.root;
    for (const part of inside.split(sep).filter(Boolean)) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) denied('Workspace symbolic links are not allowed');
    }
    if (realpathSync(path) !== path) denied('Workspace path changed during authorization');
    return path;
  }
}
