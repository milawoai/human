import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { runtimeIdentity } from './identity';
@Injectable()
export class RuntimeService {
  private token?: string;
  private close?: () => Promise<void>;
  private closing?: Promise<void>;
  configure(value: { ownerToken: string; expectedServiceInstanceId: string }): void {
    this.token = value.ownerToken;
    runtimeIdentity.instanceId = value.expectedServiceInstanceId;
  }
  setShutdown(callback: () => Promise<void>): void { this.close = callback; }
  authorize(token: unknown): boolean {
    if (typeof token !== 'string' || !this.token) return false;
    const actual = Buffer.from(token), expected = Buffer.from(this.token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  identity() { return { ...runtimeIdentity }; }
  shutdown(): Promise<void> {
    if (!this.close) return Promise.reject(Error('Runtime shutdown is not initialized'));
    return this.closing ??= Promise.resolve().then(this.close);
  }
}
