import assert from 'node:assert/strict';
import { transitionJob, occupiesJobSlot, isJobSettled } from '../core/job-state';
import type { JobSnapshot, JobState } from '../jobs.types';
import { JobError } from '../jobs.errors';

const accepted: JobSnapshot = { jobId: 'j1', kind: 'pi-readonly', state: 'accepted', seq: 1, createdAt: 10 };
const running = transitionJob(accepted, 1, { type: 'dispatch' }, 20);
assert.equal(running.state, 'running');
assert.equal(running.seq, 2);
assert.equal(running.startedAt, 20);
assert.equal(accepted.state, 'accepted', 'transitions do not mutate input');
const cancelling = transitionJob(running, 2, { type: 'cancel' }, 30);
assert.equal(cancelling.cancelRequestedAt, 30);
assert.equal(transitionJob(cancelling, 3, { type: 'cancel' }, 40), cancelling,
  'repeated cancellation is a no-op, allowing dispatcher to avoid another abort');
for (const outcome of ['succeeded', 'failed', 'cancelled'] as const) {
  const finished = transitionJob(cancelling, 3, { type: 'settle', outcome }, 50);
  assert.equal(finished.state, outcome, 'actual worker outcome wins over cancellation intent');
  assert.equal(finished.seq, 4);
  assert.equal(finished.finishedAt, 50);
  assert.equal(transitionJob(finished, 4, { type: 'cancel' }, 60), finished);
  assert.throws(() => transitionJob(finished, 4, { type: 'settle', outcome: 'failed' }, 60), JobError);
}
assert.equal(transitionJob(accepted, 1, { type: 'cancel' }, 20).state, 'cancelled');
assert.throws(() => transitionJob(accepted, 1, { type: 'settle', outcome: 'succeeded' }, 20), JobError);
assert.throws(() => transitionJob(cancelling, 3, { type: 'dispatch' }, 40), JobError);
assert.throws(() => transitionJob(running, 1, { type: 'cancel' }, 30),
  (e: unknown) => e instanceof JobError && e.code === 'JOB_STALE_VERSION');
for (const job of [accepted, running, cancelling]) {
  const unknown = transitionJob(job, job.seq, { type: 'recover', reason: 'owner exited' }, 60);
  assert.equal(unknown.state, 'unknown');
  assert.equal(unknown.seq, job.seq + 1);
  assert.equal(isJobSettled(unknown.state), false);
  assert.throws(() => transitionJob(unknown, unknown.seq, { type: 'dispatch' }, 70), JobError);
}
for (const state of ['accepted', 'running', 'cancelling'] as const) assert.ok(occupiesJobSlot(state));
for (const state of ['succeeded', 'failed', 'cancelled', 'unknown'] as const) assert.ok(!occupiesJobSlot(state));
assert.equal(isJobSettled('succeeded'), true);
assert.throws(() => transitionJob(cancelling, 3, { type: 'settle', outcome: 'succeeded' }, 25), JobError,
  'transition time cannot predate the recorded cancellation');
assert.throws(() => transitionJob(running, 2, { type: 'recover', reason: '' }, 60), JobError);
assert.throws(() => transitionJob({ ...accepted, state: 'queued' as JobState }, 1, { type: 'cancel' }, 20), JobError);
console.log('PASS: lifecycle, cancellation races, recovery and sequence guards');
