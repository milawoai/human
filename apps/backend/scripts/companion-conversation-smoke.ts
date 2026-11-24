import { runConversationIndexCases } from '../src/brain/conversation/tests/conversation-index.cases';
import { runPiConversationFactoryCases } from '../src/brain/conversation/tests/pi-conversation.factory.cases';

Promise.resolve()
  .then(runConversationIndexCases)
  .then(runPiConversationFactoryCases)
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
