import assert from 'node:assert/strict';
import { parseSubmitJob, fingerprintJob } from '../core/job-input';
import { JobError } from '../jobs.errors';

const input = { idempotencyKey: 'request-1', kind: 'pi-readonly', spec: { prompt: 'Read README', cwd: '/workspace' } };
const parsed = parseSubmitJob(input);
assert.deepEqual(parsed, input);
assert.notEqual(parsed.spec, input.spec, 'validated DTO must not retain caller-owned objects');
assert.equal(fingerprintJob(parsed), fingerprintJob(parseSubmitJob({
  spec: { cwd: '/workspace', prompt: 'Read README' }, kind: 'pi-readonly', idempotencyKey: 'another-key',
})), 'key and property order do not change execution identity');
for (const spec of [
  { ...input.spec, prompt: 'Read package.json' },
  { ...input.spec, cwd: '/other' },
  { ...input.spec, profileName: 'other' },
]) assert.notEqual(fingerprintJob(parsed), fingerprintJob(parseSubmitJob({ ...input, spec })));

const invalid: unknown[] = [null, [], {}, { ...input, kind: 'shell' },
  { ...input, idempotencyKey: '' }, { ...input, idempotencyKey: 'x'.repeat(129) },
  { ...input, scopeKey: 'spoof' }, { ...input, signal: {} },
  ...[{ prompt: ' ' }, { cwd: 'relative/path' }, { cwd: '/a\0b' }, { profileName: '' },
    { allowedTools: ['bash'] }, { prompt: 1 }].map(change => ({ ...input, spec: { ...input.spec, ...change } })),
];
for (const value of invalid) assert.throws(() => parseSubmitJob(value),
  (error: unknown) => error instanceof JobError && error.code === 'JOB_INVALID_INPUT');
assert.equal(parsed.spec.prompt, 'Read README');
console.log('PASS: input validation and stable execution fingerprint');
