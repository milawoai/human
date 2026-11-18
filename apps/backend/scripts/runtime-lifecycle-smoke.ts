import { verifyBrainInitRepeat } from '../src/runtime/tests/brain-init-repeat';
import { verifyOwnerChannel } from '../src/runtime/tests/owner-channel';
import { verifyRuntimeProcesses } from '../src/runtime/tests/processes';
async function main() { await verifyOwnerChannel(); await verifyBrainInitRepeat(); await verifyRuntimeProcesses(); }
main().catch(error => { console.error(error); process.exitCode = 1; });
