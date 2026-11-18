import { verifyInstances } from '../src/neural/tests/instances';
verifyInstances();
import { verifyInstanceQueries } from '../src/neural/tests/instance-queries';
verifyInstanceQueries();
import { verifyReplacementAfterExit } from '../src/neural/tests/instances';
verifyReplacementAfterExit();
import { verifyInstanceHttp } from '../src/neural/tests/instance-http';
verifyInstanceHttp().catch(error => { console.error(error); process.exitCode = 1; });
