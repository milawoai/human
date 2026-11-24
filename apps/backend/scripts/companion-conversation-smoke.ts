import { runConversationIndexCases } from '../src/brain/conversation/tests/conversation-index.cases';
import { runPiConversationFactoryCases } from '../src/brain/conversation/tests/pi-conversation.factory.cases';
import { runCompanionRuntimeCases } from '../src/brain/conversation/tests/companion-runtime.cases';
import { runBrainConversationCases } from '../src/brain/conversation/tests/brain-conversation.cases';
import { runConversationDiCases } from '../src/brain/conversation/tests/conversation-di.cases';

Promise.resolve()
  .then(runConversationIndexCases)
  .then(runPiConversationFactoryCases)
  .then(runCompanionRuntimeCases)
  .then(runBrainConversationCases)
  .then(runConversationDiCases)
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
