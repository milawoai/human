import assert from 'node:assert/strict';
import { NeuralCoreService } from '../neural-core/neural-core.service';
import { NeuralWsGateway } from '../neural-ws/neural-ws.gateway';
import type { Socket } from 'socket.io';

export function verifyInstances() {
  const core = new NeuralCoreService();
  const gateway = new NeuralWsGateway(core);
  const events = new Map<string, { event: string; data: any }[]>();
  const socket = (id: string) => ({ id, emit: (event: string, data: any) => {
    events.set(id, [...events.get(id) || [], { event, data }]);
  } }) as unknown as Socket;
  const actor = { actorId: 'test-hearing', runtime: 'python' as const, system: 'sensory' as const };
  const register = (client: Socket, instanceId?: string) => gateway.handleRegister({
    actor, ...(instanceId ? { protocolVersion: 1, serviceInstanceId: instanceId } : {}),
  } as any, client);
  const s1 = socket('s1'), s2 = socket('s2'), intruder = socket('intruder');
  const capability = {
    id: 'test-cap', actor, topic: 'test.hearing', kinds: ['command' as const],
    mode: 'once' as const, enabled: true, online: true,
  };
  register(s1, 'instance-1');
  gateway.handleRegisterCapabilities({ capabilities: [capability] }, s1);
  gateway.handleSubscribe({ topics: ['test.event'] }, s1);
  register(s2, 'instance-1');
  assert.equal(core.getAllCapabilities().some(c => c.online), false, 'new connection must register its capabilities again');
  assert.equal(core.getAllSubscriptions().length, 0, 'new generation must not inherit old subscriptions');
  gateway.handleRegisterCapabilities({ capabilities: [capability] }, s2);
  gateway.handleSubscribe({ topics: ['test.event'] }, s2);
  const state = core.getActorState(actor.actorId)!;
  register(s1, 'instance-1');
  assert.equal(state.connectionId, 's2', 'superseded socket cannot register itself again');
  const heartbeatAt = state.lastHeartbeatAt;
  const subscriptions = core.getAllSubscriptions().length;
  gateway.handleRegisterCapabilities({ capabilities: [{ ...capability, enabled: false }] }, s1);
  gateway.handleSubscribe({ topics: ['stale.event'] }, s1);
  gateway.handleHeartbeat(s1);
  gateway.handleUnsubscribe({ subscriptionId: core.getAllSubscriptions()[0].id }, s1);
  gateway.handleDisconnect(s1);
  assert.equal(state.connected, true, 'old disconnect cannot remove current actor');
  assert.equal(state.connectionId, 's2');
  assert.equal(state.lastHeartbeatAt, heartbeatAt);
  assert.equal(core.getAllSubscriptions().length, subscriptions);
  assert.equal(core.getAllCapabilities()[0].enabled, true);
  assert.equal(core.getAllCapabilities()[0].online, true);
  assert.equal(core.getActorIdByConnection('s1'), undefined);
  register(intruder, 'instance-2');
  assert.equal(state.connectionId, 's2', 'another instance must not take over');
  assert(events.get('intruder')?.some(e => e.event === 'error'));
  const legacy = socket('legacy');
  register(legacy);
  assert(events.get('legacy')?.some(e => e.event === 'error'), 'legacy registration is visibly incompatible');
  gateway.handleRegisterCapabilities({ capabilities: [{ ...capability, actor: { ...actor, actorId: 'someone-else' } }] }, s2);
  assert.equal(core.getAllCapabilities().length, 1, 'cannot register capabilities for other actors');
  gateway.handleRegisterCapabilities({ capabilities: [{ ...capability, actor: { ...actor, runtime: 'nest' } }] }, s2);
  assert.equal(core.getAllCapabilities()[0].actor.runtime, 'python', 'capability identity must come from the registered sender');
  const routed: any[] = [];
  gateway.sendToConnection = (id, event, data) => { routed.push({ id, event, data }); return true; };
  gateway.handleMessage({ id: 'stale', kind: 'event', topic: 'test.event', source: actor, payload: {}, timestamp: Date.now() }, s1);
  assert.equal(routed.length, 0, 'old messages cannot route');
  const current = core.getActorState(actor.actorId) as any;
  assert.equal(current.serviceInstanceId, 'instance-1');
  assert.equal(typeof current.neuralInstanceId, 'string');
  gateway.handleDisconnect(s2);
  assert.equal(state.connected, false);
  assert.equal(core.getAllSubscriptions().length, 0);
  assert.equal(core.getAllCapabilities()[0].online, false);
  console.log('PASS: instance conflict, legacy rejection, reconnect isolation, stale mutations and disconnect');
}

export function verifyReplacementAfterExit() {
  const core = new NeuralCoreService();
  const actor = { actorId: 'restart-fixture', runtime: 'python' as const, system: 'sensory' as const };
  core.registerActor(actor, 'old', 'old-process');
  core.unregisterActor(actor.actorId, 'old');
  assert.doesNotThrow(() => core.registerActor(actor, 'new', 'new-process'), 'a disconnected old process must not permanently block restart');
  assert.equal(core.getActorState(actor.actorId)?.serviceInstanceId, 'new-process');
  assert.equal(core.unregisterActor(actor.actorId, 'old'), false);
  assert.equal(core.getActorState(actor.actorId)?.connected, true);
  console.log('PASS: replacement after confirmed disconnect preserves generation guards');
}
