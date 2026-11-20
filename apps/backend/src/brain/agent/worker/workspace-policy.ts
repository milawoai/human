import { constants, closeSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, opendirSync,
  readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { JobError } from '@/motor/jobs/jobs.errors';

const denied = (message: string): never => { throw new JobError('JOB_WORKSPACE_DENIED', message); };
const same = (a: { dev: number; ino: number }, b: { dev: number; ino: number }) => a.dev === b.dev && a.ino === b.ino;
const MAX_FILE_BYTES = 256 * 1024;

/** Local IO guard, not an OS sandbox against hostile concurrent filesystem mutation. */
export class WorkspacePolicy {
  readonly root: string;
  private readonly rootIdentity;
  constructor(root: string, private readonly assertAuthorized: () => void = () => {}) {
    if (!isAbsolute(root)) denied('Workspace root must be absolute');
    this.root = realpathSync(root);
    if (this.root === parse(this.root).root) denied('Filesystem root cannot be authorized as a Job workspace');
    this.rootIdentity = lstatSync(this.root);
    if (!this.rootIdentity.isDirectory()) denied('Workspace root must be a directory');
  }

  authorizeCwd(cwd: string): string {
    if (typeof cwd !== 'string' || !cwd || cwd.includes('\0') || isAbsolute(cwd)) {
      denied('Job cwd must be relative to its authorized workspace');
    }
    const path = this.checked(this.root, cwd);
    if (!lstatSync(path).isDirectory()) denied('Job cwd is not a directory');
    return path;
  }

  read(cwd: string, input: string, remainingBytes = MAX_FILE_BYTES) {
    const limit = Math.min(MAX_FILE_BYTES, remainingBytes);
    if (!Number.isSafeInteger(limit) || limit < 0) denied('Invalid remaining read budget');
    const path = this.checked(cwd, input);
    const before = lstatSync(path);
    if (!before.isFile() || before.nlink !== 1) denied('Only ordinary, non-hard-linked text files can be read');
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
      return { text, bytes: length, evidence: this.evidence(path, data, text) };
    } finally { closeSync(fd); }
  }

  write(cwd: string, input: string, content: string, remainingBytes = MAX_FILE_BYTES, overwrite = false) {
    if (typeof content !== 'string' || content.includes('\0')) denied('Only UTF-8 text writes are supported');
    const data = Buffer.from(content, 'utf8');
    const limit = Math.min(MAX_FILE_BYTES, remainingBytes);
    if (!Number.isSafeInteger(limit) || limit < 0 || data.length > limit) denied('Write exceeds the remaining Job IO budget');
    const path = this.checked(cwd, input, true);
    const parent = dirname(path);
    const parentInfo = lstatSync(parent);
    if (!parentInfo.isDirectory()) denied('Write parent must be an existing directory');
    let targetInfo: Stats | undefined;
    try { targetInfo = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (targetInfo?.isSymbolicLink() || (targetInfo && !targetInfo.isFile())) denied('Only ordinary files can be replaced');
    if (targetInfo && !overwrite) denied('File already exists; explicit overwrite is required');

    const temporary = join(parent, `.${basename(path)}.${randomUUID()}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      writeFileSync(fd, data);
      fsyncSync(fd);
      closeSync(fd); fd = undefined;
      this.checked(cwd, input, true);
      if (!same(parentInfo, lstatSync(parent))) denied('Write parent changed during authorization');
      let currentTarget: Stats | undefined;
      try { currentTarget = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (targetInfo ? !currentTarget || !same(targetInfo, currentTarget) : !!currentTarget) {
        denied('Write target changed during authorization');
      }
      if (targetInfo) renameSync(temporary, path);
      else {
        linkSync(temporary, path);
        unlinkSync(temporary);
      }
      return { bytes: data.length, evidence: this.evidence(path, data, content) };
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch { /* rename consumed the temp file */ }
    }
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

  private evidence(path: string, data: Buffer, text: string) {
    return { path: relative(this.root, path) || '.', startLine: 1,
      endLine: Math.max(1, text.split('\n').length - (text.endsWith('\n') ? 1 : 0)),
      contentHash: createHash('sha256').update(data).digest('hex') };
  }

  private checked(cwd: string, input: string, allowMissingLeaf = false): string {
    this.assertAuthorized();
    if (typeof input !== 'string' || !input || input.includes('\0') || isAbsolute(input)) denied('Job paths must be relative');
    const path = resolve(cwd, input);
    const inside = relative(this.root, path);
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) denied('Path is outside the authorized workspace');
    const rootNow = lstatSync(this.root);
    if (rootNow.isSymbolicLink() || !same(rootNow, this.rootIdentity)) denied('Workspace root identity changed');
    let current = this.root;
    const parts = inside.split(sep).filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      try {
        if (lstatSync(current).isSymbolicLink()) denied('Workspace symbolic links are not allowed');
      } catch (error) {
        if (!allowMissingLeaf || index !== parts.length - 1 || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    try {
      if (realpathSync(path) !== path) denied('Workspace path changed during authorization');
    } catch (error) {
      if (!allowMissingLeaf || (error as NodeJS.ErrnoException).code !== 'ENOENT' || realpathSync(dirname(path)) !== dirname(path)) throw error;
    }
    this.assertAuthorized();
    return path;
  }
}
