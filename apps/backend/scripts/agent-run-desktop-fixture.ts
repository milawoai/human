/** Local deterministic UI fixture; refuses to replace an existing listener. No model/network tools. */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { BrainAgentService } from '../src/brain/agent/brain-agent.service';

const server = createServer();
const io = new Server(server);
const ns = io.of('/neural');
ns.on('connection', socket => {
  socket.on('register', () => socket.emit('registered', { success: true }));
  socket.on('subscribe', () => socket.emit('subscribed', { success: true }));
});
const service = Object.create(BrainAgentService.prototype) as any;
const sessions = new Map<string, any>();
service.publishEvent = (topic: string, payload: any) => ns.emit('message', { topic, payload });
service.llmService = { resolveModel: async () => ({ profileName: 'fixture', profile: {}, model: {} }) };
service.providerAuthService = { resolveApiKey: async () => undefined };
service.sessionStore = {
  loadSessionFile: (id: string) => sessions.get(id),
  upsertSession: (input: any) => { sessions.set(input.sessionId, input); return { sessionId: input.sessionId }; },
  getSession: (id: string) => sessions.get(id),
  listSessions: () => [...sessions.values()],
};
service.getAgentCore = async () => ({ Agent: class {
  state: any;
  listener = (_event: any) => {};
  release = () => {};
  constructor(options: any) { this.state = { messages: [...options.initialState.messages] }; }
  subscribe(listener: any) { this.listener = listener; return () => {}; }
  abort() { this.state.errorMessage = 'fixture cancelled'; this.release(); }
  async prompt(text: string) {
    this.state.messages.push({ role: 'user', content: text });
    this.listener({ type: 'agent_start' });
    if (!text.includes('complete')) await new Promise<void>(resolve => { this.release = resolve; });
    const message = { role: 'assistant', content: [{ type: 'text', text: 'fixture response' }], stopReason: this.state.errorMessage ? 'aborted' : 'stop' };
    this.state.messages.push(message);
    this.listener({ type: 'message_end', message });
    this.listener({ type: 'agent_end' });
  }
  async waitForIdle() {}
} });
server.on('request', async (req, res) => {
  if (req.url?.startsWith('/socket.io')) return;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Human-Test-Fixture', 'agent-run-management');
  if (req.method !== 'POST' || req.url !== '/neural/trigger') { res.statusCode = 404; res.end('{}'); return; }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const result = await service.handleCommand({ id: crypto.randomUUID(), ...body });
    res.end(JSON.stringify(result));
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ success: false, msg: String(error) })); }
});
server.listen(12002, '127.0.0.1', () => console.log('AGENT_RUN_UI_FIXTURE_READY'));
process.on('SIGTERM', () => { io.close(); server.close(); process.exit(0); });
