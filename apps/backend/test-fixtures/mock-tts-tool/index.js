/**
 * mock-tts-tool — mock TTS 插件（P4 替换验证用）
 *
 * 零依赖、duck-typing 实现 tts 契约 v1（不 import 宿主代码）：
 * - tts.synthesize：生成一段真实可播的最小 WAV 落盘到 ~/.ai_secretary/tts_cache，
 *   用宿主注入的 context.publicBaseUrl 构造 Body 可访问的 URL
 * - tts.voices.list：返回固定音色列表
 * 导出工厂形态 { create(): BuiltinToolProvider }（与 cmux-tools 同形态）。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

var CACHE_DIR = path.join(os.homedir(), '.ai_secretary', 'tts_cache', 'mock-tts');

/** 生成最小合法 WAV（16-bit PCM 单声道静音） */
function makeWav(durationMs) {
  var sampleRate = 16000;
  var numSamples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  var dataSize = numSamples * 2;
  var buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

var provider = {
  providerId: 'mock-tts',
  createInstance: function (descriptor) {
    return {
      descriptor: descriptor,
      status: 'ready',
      execute: async function (capability, params, context) {
        if (capability === 'tts.synthesize') {
          var durationMs = 800;
          var wav = makeWav(durationMs);
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          var file = 'speech-' + Date.now() + '.wav';
          fs.writeFileSync(path.join(CACHE_DIR, file), wav);
          var base = (context && context.publicBaseUrl) || 'http://127.0.0.1:12002';
          return {
            success: true,
            data: {
              audioUrl: base + '/tts-cache/mock-tts/' + file,
              durationMs: durationMs,
              format: 'wav',
            },
          };
        }
        if (capability === 'tts.voices.list') {
          return {
            success: true,
            data: {
              voices: [
                { voiceId: 'mock-female', name: 'Mock 女声', language: 'zh-CN' },
                { voiceId: 'mock-male', name: 'Mock 男声', language: 'zh-CN' },
              ],
            },
          };
        }
        return {
          success: false,
          error: { code: 'CAPABILITY_NOT_FOUND', message: 'mock-tts 不支持 ' + capability },
        };
      },
    };
  },
};

module.exports = { create: function () { return provider; } };
