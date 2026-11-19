import 'reflect-metadata';
import { runDispatchCases } from '../src/motor/jobs/tests/job-dispatch.cases';
import { runDispatchFailureCases } from '../src/motor/jobs/tests/job-dispatch-failure.cases';
import { runDispatchBoundaryCases } from '../src/motor/jobs/tests/job-dispatch-boundary.cases';

async function main() {
  await runDispatchCases();
  await runDispatchFailureCases();
  await runDispatchBoundaryCases();
  console.log('Job dispatch: ALL GROUPS PASS (fixture executors; no host recovery or Pi)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
