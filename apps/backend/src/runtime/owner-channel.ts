import type { Readable } from 'node:stream';
export interface OwnerBootstrap {
  type: 'bootstrap'; protocolVersion: 1; ownerInstanceId: string;
  expectedServiceInstanceId: string; ownerToken: string; neuralUrl: string;
}
/** stdin stays open after its only bootstrap frame; EOF revokes ownership. */
export function readOwnerBootstrap(input: Readable, onLost: () => void, timeoutMs = 5000): Promise<OwnerBootstrap> {
  return new Promise((resolve, reject) => {
    let buffer = '', settled = false, ended = false;
    const timer = setTimeout(() => fail(Error('Owner handshake timeout')), timeoutMs);
    const cleanup = () => { clearTimeout(timer); input.removeListener('data', data); };
    const fail = (error: Error) => { cleanup(); input.destroy(); reject(error); };
    const end = () => {
      if (ended) return;
      ended = true;
      if (settled) onLost(); else fail(Error('Owner pipe closed before handshake'));
    };
    const data = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      if (Buffer.byteLength(buffer) > 4096) { fail(Error('Owner frame too large')); return; }
      if (!buffer.includes('\n')) return;
      try {
        const value = JSON.parse(buffer.trim()) as OwnerBootstrap;
        if (value.type !== 'bootstrap' || value.protocolVersion !== 1 ||
            typeof value.ownerInstanceId !== 'string' || !value.ownerInstanceId || value.ownerInstanceId.length > 128 ||
            typeof value.expectedServiceInstanceId !== 'string' || !value.expectedServiceInstanceId || value.expectedServiceInstanceId.length > 128 ||
            typeof value.ownerToken !== 'string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(value.ownerToken)) {
          throw Error('Invalid owner bootstrap');
        }
        const url = new URL(value.neuralUrl);
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/neural' || url.username || url.password || url.search || url.hash) throw Error('Invalid Neural endpoint');
        settled = true;
        cleanup();
        // Drain later input, but never log it or treat it as a new credential.
        input.resume();
        resolve(value);
      } catch { fail(Error('Invalid owner bootstrap')); }
    };
    input.on('data', data);
    input.once('end', end);
    input.once('close', end);
    input.once('error', end);
  });
}
