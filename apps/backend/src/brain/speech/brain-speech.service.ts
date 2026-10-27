import { Injectable } from '@nestjs/common';
import { MotorToolRunnerService } from '../../motor/motor-tool-runner/motor-tool-runner.service';
import { validSpeechSummary } from './speech-summary';

export interface SpeechResult {
  status: 'ready' | 'failed';
  summary: string;
  audioUrl?: string;
  error?: string;
}

@Injectable()
export class BrainSpeechService {
  constructor(private readonly motor: MotorToolRunnerService) {}

  async synthesize(summary: string | undefined, sessionId: string): Promise<SpeechResult | undefined> {
    if (!validSpeechSummary(summary)) return undefined;
    const invoke = (topic: string, payload: any) => this.motor.handleCommand({
      id: crypto.randomUUID(), kind: topic.endsWith('.list') ? 'query' : 'command', topic,
      source: { actorId: 'brain-main', runtime: 'nest', system: 'brain', module: 'speech' },
      timestamp: Date.now(), payload,
    });
    try {
      const discovery: any = await invoke('motor.tool.list', { category: 'tts', detailed: true });
      const tool = discovery.success && discovery.data?.tools?.find((t: any) =>
        ['ready', 'running'].includes(t.status) && t.capabilities?.includes('tts.synthesize'));
      if (!tool) throw new Error('没有可用的语音插件，请先启用 TTS 插件');
      const result: any = await invoke('motor.tool.execute', {
        tool: tool.id, capability: 'tts.synthesize', sessionId,
        parameters: { text: summary, format: 'wav' },
      });
      if (!result.success || !result.data?.success) throw new Error(result.data?.error?.message || result.msg || '语音合成失败');
      const url = new URL(result.data.data?.audioUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('语音插件返回了不支持的音频地址');
      return { status: 'ready', summary, audioUrl: url.href };
    } catch (error) {
      return { status: 'failed', summary, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
