import assert from 'node:assert/strict';
import { decideJobAdmission } from '../core/job-admission';
import type { JobAdmissionRecord } from '../jobs.types';
import { JobError } from '../jobs.errors';

const request = { scopeKey: 'scope-a', idempotencyKey: 'key', specHash: 'hash' };
const existing: JobAdmissionRecord = { ...request, jobId: 'old', state: 'succeeded' };
const busy: JobAdmissionRecord = { ...request, jobId: 'active', idempotencyKey: 'other', state: 'running' };
assert.deepEqual(decideJobAdmission(request, undefined, false), { kind: 'create' });
assert.deepEqual(decideJobAdmission(request, existing, true), { kind: 'reuse', jobId: 'old' },
  'idempotent replay precedes global busy check');
assert.throws(() => decideJobAdmission({ ...request, specHash: 'different' }, existing, true),
  (e: unknown) => e instanceof JobError && e.code === 'JOB_IDEMPOTENCY_CONFLICT');
assert.throws(() => decideJobAdmission(request, undefined, true),
  (e: unknown) => e instanceof JobError && e.code === 'JOB_BUSY');
assert.throws(() => decideJobAdmission(request, busy, true),
  (e: unknown) => e instanceof JobError && e.code === 'JOB_SCOPE_MISMATCH',
  'a wrongly scoped/keyed repository lookup must not leak a reused job');
assert.throws(() => decideJobAdmission({ ...request, scopeKey: 'scope-b' }, existing, false), JobError);
assert.deepEqual(decideJobAdmission({ ...request, scopeKey: 'scope-b' }, undefined, false), { kind: 'create' });
assert.deepEqual(existing, { ...request, jobId: 'old', state: 'succeeded' }, 'admission has no write effects');
console.log('PASS: idempotency before busy, conflict and scope isolation');
