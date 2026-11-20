import assert from 'node:assert/strict';
import { parseSubmitJob, fingerprintJob } from '../core/job-input';
import { JobError } from '../jobs.errors';
import { configuredJobJsonBodyLimit, configuredJobPromptMaxChars } from '../jobs.config';
import { payloadLogSummary } from '../../../neural/neural-http/payload-log';

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
assert.equal(parseSubmitJob({ ...input, spec: { ...input.spec, prompt: 'x'.repeat(41) } }, 41).spec.prompt.length, 41);
assert.throws(() => parseSubmitJob({ ...input, spec: { ...input.spec, prompt: 'x'.repeat(42) } }, 41),
  (error: unknown) => error instanceof JobError && error.code === 'JOB_INVALID_INPUT');
assert.equal(configuredJobPromptMaxChars({}), 100_000);
assert.equal(configuredJobPromptMaxChars({ HUMAN_JOB_PROMPT_MAX_CHARS: '250000' }), 250_000);
assert.equal(configuredJobPromptMaxChars({ HUMAN_JOB_PROMPT_MAX_CHARS: '0' }), undefined);
assert.equal(configuredJobJsonBodyLimit({}), '416384b');
assert.equal(configuredJobJsonBodyLimit({ HUMAN_JOB_PROMPT_MAX_CHARS: '250000' }), '1016384b');
const sensitivePayload = { prompt: 'secret prompt must not be logged', cwd: '/private/project' };
const payloadLog = payloadLogSummary(sensitivePayload);
assert.match(payloadLog, /payloadType=object/);
assert.doesNotMatch(payloadLog, /secret prompt|private\/project/);
console.log('PASS: input validation and stable execution fingerprint');
