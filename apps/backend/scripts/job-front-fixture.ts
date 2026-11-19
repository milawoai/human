import type { INestApplication } from '@nestjs/common';
import { BrainAgentService } from '../src/brain/agent/brain-agent.service';
import { NeuralCoreService } from '../src/neural/neural-core/neural-core.service';
import { NeuralWsGateway } from '../src/neural/neural-ws/neural-ws.gateway';
import { NeuralHttpService } from '../src/neural/neural-http/neural-http.service';

/** Actual foreground handler and SDK; session storage/model transport are fixtures. */
export function registerForegroundFixture(app: INestApplication, llm: unknown) {
  const brain = Object.create(BrainAgentService.prototype) as any;
  Object.assign(brain, { coreService: app.get(NeuralCoreService), wsGateway: app.get(NeuralWsGateway),
    httpService: app.get(NeuralHttpService), llmService: llm,
    logger: { log() {} }, providerAuthService: { resolveApiKey: async () => undefined },
    sessionStore: { getDbPath: () => 'in-memory-fixture', loadSessionFile: () => null,
      upsertSession: ({ sessionId }: { sessionId: string }) => ({ sessionId }) },
    getAgentCore: () => new Function('return import("@earendil-works/pi-agent-core")')(),
  });
  brain.onModuleInit();
}
