/**
 * tts 类别契约 v1
 *
 * 首个类别契约。原则：
 * - 只描述「文本进、可播放音频 URL 出」的能力面，不含任何引擎概念
 *   （引擎模型名、云服务 voice 枚举等一律不出现在契约中，由插件内部消化）
 * - audioUrl 必须是 Body（Electron 渲染进程）可访问的 HTTP URL，
 *   由插件落盘后借助宿主注入的 publicBaseUrl 构造
 * - clone 系列为可选能力，执行方式为 async（P5 job 层生效，契约先行声明）
 */
import type { ToolContract } from '../types';

export const TTS_CONTRACT_V1: ToolContract = {
  category: 'tts',
  version: '1.0',
  description: 'TTS 语音合成类别契约 v1 —— 文本进、Body 可播放音频 URL 出',
  capabilities: [
    {
      name: 'tts.synthesize',
      description: '文本合成语音',
      required: true,
      mode: 'sync',
      parameters: {
        text: { type: 'string', required: true, minLength: 1, description: '待合成文本' },
        voiceId: { type: 'string', description: '音色 ID，缺省用插件默认音色' },
        speed: { type: 'number', minimum: 0.25, maximum: 4, description: '语速倍率' },
        format: { type: 'string', enum: ['wav', 'mp3'], description: '期望音频格式' },
      },
      returns: {
        audioUrl: { type: 'string', required: true, description: 'Body 可访问的音频 HTTP URL' },
        durationMs: { type: 'number', description: '音频时长（毫秒）' },
        format: { type: 'string', description: '实际输出的音频格式' },
      },
    },
    {
      name: 'tts.voices.list',
      description: '列出可用音色（音色体系的唯一发现入口）',
      required: true,
      mode: 'sync',
      parameters: {},
      returns: {
        voices: {
          type: 'array',
          required: true,
          items: { type: 'object' },
          description: '音色列表，元素建议含 voiceId/name/language 等字段',
        },
      },
    },
    {
      name: 'tts.voices.select',
      description: '设置默认音色（写回 Runtime Config）',
      required: false,
      mode: 'sync',
      parameters: {
        voiceId: { type: 'string', required: true, description: '音色 ID' },
      },
      returns: {
        current: { type: 'string', required: true, description: '生效的默认音色 ID' },
      },
    },
    {
      name: 'tts.clone.register',
      description: '注册语音克隆任务（异步，返回 taskId；P5 生效）',
      required: false,
      mode: 'async',
      parameters: {
        name: { type: 'string', required: true, description: '新音色名称' },
        sampleAudioUrl: { type: 'string', required: true, description: '样本音频 URL' },
      },
      returns: {
        taskId: { type: 'string', required: true, description: '宿主 job ID' },
      },
    },
    {
      name: 'tts.clone.status',
      description: '查询克隆任务状态（P5 生效）',
      required: false,
      mode: 'sync',
      parameters: {
        taskId: { type: 'string', required: true, description: '任务 ID' },
      },
      returns: {
        state: { type: 'string', required: true, description: 'pending/running/completed/failed' },
      },
    },
  ],
  events: [
    {
      name: 'synthesis_completed',
      description: '异步合成完成（async 模式下推送，含 taskId）',
      payloadSchema: {
        taskId: '宿主任务 ID',
        audioUrl: '结果音频 URL',
      },
    },
    {
      name: 'clone_completed',
      description: '克隆训练完成',
      payloadSchema: {
        taskId: '宿主任务 ID',
        voiceId: '新音色 ID',
      },
    },
    {
      name: 'clone_failed',
      description: '克隆训练失败',
      payloadSchema: {
        taskId: '宿主任务 ID',
        error: '失败原因',
      },
    },
  ],
};
