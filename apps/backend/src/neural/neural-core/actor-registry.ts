import { randomUUID } from 'node:crypto';
import type { ActorRef, ActorState } from '../interfaces';

/** One server generation per Node process; later exposed by runtime identity. */
export const neuralInstanceId = randomUUID();

export class ActorRegistry {
  readonly actors = new Map<string, ActorState>();
  private readonly connections = new Map<string, string>();

  register(actor: ActorRef, connectionId: string, serviceInstanceId: string): boolean {
    const previous = this.actors.get(actor.actorId);
    if (previous?.connected && previous.serviceInstanceId !== serviceInstanceId) {
      throw new Error(`Actor ${actor.actorId} belongs to another service instance`);
    }
    if (previous?.connectionId) this.connections.delete(previous.connectionId);
    const state = previous ?? { actor, connected: false } as ActorState;
    Object.assign(state, {
      actor, connected: true, connectionId, serviceInstanceId, neuralInstanceId,
      lastHeartbeatAt: Date.now(),
    });
    this.actors.set(actor.actorId, state);
    this.connections.set(connectionId, actor.actorId);
    return !previous;
  }

  registerInternal(actor: ActorRef): boolean {
    const previous = this.actors.get(actor.actorId);
    if (previous && previous.serviceInstanceId !== neuralInstanceId) throw new Error('Internal Actor conflict');
    this.actors.set(actor.actorId, {
      actor, connected: true, serviceInstanceId: neuralInstanceId, neuralInstanceId,
      lastHeartbeatAt: Date.now(),
    });
    return !previous;
  }

  isCurrent(actorId: string, connectionId: string): boolean {
    const state = this.actors.get(actorId);
    return state?.connected === true && state.connectionId === connectionId;
  }

  actorFor(connectionId: string): string | undefined {
    return this.connections.get(connectionId);
  }

  unregister(actorId: string, connectionId?: string): boolean {
    const state = this.actors.get(actorId);
    if (!state || (connectionId !== undefined && !this.isCurrent(actorId, connectionId))) return false;
    if (state.connectionId) this.connections.delete(state.connectionId);
    state.connected = false;
    state.connectionId = undefined;
    return true;
  }

  heartbeat(actorId: string, connectionId?: string): void {
    const state = this.actors.get(actorId);
    if (state && (connectionId === undefined || this.isCurrent(actorId, connectionId))) {
      state.lastHeartbeatAt = Date.now();
    }
  }
}
