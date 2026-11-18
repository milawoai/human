import assert from 'node:assert/strict';
import { NeuralCoreService } from '../neural-core/neural-core.service';
import { NeuralHttpService } from '../neural-http/neural-http.service';
import { NeuralWsGateway } from '../neural-ws/neural-ws.gateway';
import { ModuleRef } from '@nestjs/core';

export function verifyInstanceQueries() {
  const core = new NeuralCoreService();
  const actor = { actorId: 'query-fixture', runtime: 'python' as const, system: 'sensory' as const };
  core.registerActor(actor, 'c1', 'i1');
  core.registerCapabilities([{ id: 'fixture', actor, topic: 'fixture', mode: 'once', enabled: true, online: true }]);
  const http = new NeuralHttpService(core, new NeuralWsGateway(core), {} as ModuleRef);
  const filtered = (http.listActors as any)({ serviceInstanceId: 'not-current' });
  assert.equal(filtered.data.length, 0, 'actor queries must filter instance');
  assert.equal((http.listActors as any)({ serviceInstanceId: 'i1' }).data.length, 1);
  assert.equal(http.listCapabilities({ serviceInstanceId: 'not-current' } as any).data.length, 0);
  assert.equal((http.listActors as any)({ neuralInstanceId: 'old-node' }).data.length, 0);
  core.registerInternalActor({ ...actor, actorId: 'internal', runtime: 'nest' });
  assert.equal(core.getActorState('internal')?.connectionId, undefined, 'internal actor has no WS connection');
  console.log('PASS: instance-scoped queries and internal Actor identity');
}
