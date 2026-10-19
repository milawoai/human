/**
 * 契约与插件解析 smoke 验证
 *
 * 覆盖 P1 基建的三件事（无需起 backend、无需真实 TTS 引擎）：
 * 1. 类别契约校验：合规 tts 声明通过；缺必选能力/版本未注册被拒
 * 2. 字段 Schema 校验：required / type / enum / 宽松策略（多余字段、可选缺省不报错）
 * 3. PluginResolver：在临时「插件根目录」中安装一个假插件包（CJS），
 *    断言能解析入口、能 importModule 加载并取出 provider —— 工程外安装可达
 *
 * 运行：yarn workspace backend verify:contracts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ContractRegistry,
  createDefaultRegistry,
  validateFields,
  TTS_CONTRACT_V1,
} from '@human/contracts';
import { PluginResolver } from '../src/motor/motor-tool-runner/core/plugin-resolver';

async function main(): Promise<void> {
  // ──────────────────────────────────────────────
  // 1. 类别契约校验
  // ──────────────────────────────────────────────
  const registry = createDefaultRegistry();

  const goodTool = {
    id: 'mock-tts',
    category: 'tts',
    contractVersion: '1.0',
    capabilities: [{ name: 'tts.synthesize' }, { name: 'tts.voices.list' }],
  };
  const good = registry.validateTool(goodTool);
  assert.ok(good.ok, `合规 tts 声明应通过: ${good.errors.join('; ')}`);
  assert.strictEqual(good.contract?.category, 'tts');

  const missingRequired = registry.validateTool({
    id: 'bad-tts',
    category: 'tts',
    contractVersion: '1.0',
    capabilities: [{ name: 'tts.synthesize' }], // 缺 voices.list
  });
  assert.ok(!missingRequired.ok, '缺必选能力应被拒绝');
  assert.ok(
    missingRequired.errors.some((e) => e.includes('tts.voices.list')),
    '错误信息应指出缺失的能力',
  );

  const unknownVersion = registry.validateTool({
    id: 'bad-tts',
    category: 'tts',
    contractVersion: '9.9',
    capabilities: [{ name: 'tts.synthesize' }, { name: 'tts.voices.list' }],
  });
  assert.ok(!unknownVersion.ok, '未注册版本应被拒绝');

  const noVersion = registry.validateTool({
    id: 'bad-tts',
    category: 'tts',
    capabilities: [{ name: 'tts.synthesize' }],
  });
  assert.ok(!noVersion.ok, '声明 category 但缺 contractVersion 应被拒绝');

  const noCategory = registry.validateTool({ id: 'legacy-tool', capabilities: [] });
  assert.ok(noCategory.ok, '未声明 category 的存量工具应直接通过');

  const emptyRegistry = new ContractRegistry();
  assert.strictEqual(emptyRegistry.versions('tts').length, 0, '空注册表不应有 tts 契约');
  emptyRegistry.register(TTS_CONTRACT_V1);
  assert.ok(emptyRegistry.has('tts', '1.0'));
  console.log('✓ 类别契约校验（通过/缺失必选/未知版本/缺版本/存量兼容）');

  // ──────────────────────────────────────────────
  // 2. 字段 Schema 校验
  // ──────────────────────────────────────────────
  const synthParams = TTS_CONTRACT_V1.capabilities[0].parameters!;
  const synthReturns = TTS_CONTRACT_V1.capabilities[0].returns!;

  assert.ok(
    validateFields({ text: '你好', speed: 1.2 }, synthParams, 'parameters').ok,
    '合规入参应通过',
  );

  const missingText = validateFields({ speed: 1 }, synthParams, 'parameters');
  assert.ok(!missingText.ok && missingText.errors.some((e) => e.includes('text')), '缺 text 应报错');

  const badEnum = validateFields({ text: 'hi', format: 'flac' }, synthParams, 'parameters');
  assert.ok(!badEnum.ok && badEnum.errors.some((e) => e.includes('format')), 'format 非法枚举应报错');

  assert.ok(
    validateFields({ text: 'hi', extra: 'ignored' }, synthParams, 'parameters').ok,
    '多余字段不应报错（宽松策略）',
  );

  const badReturn = validateFields({ durationMs: 1000 }, synthReturns, 'result');
  assert.ok(!badReturn.ok && badReturn.errors.some((e) => e.includes('audioUrl')), '出参缺 audioUrl 应报错');

  assert.ok(
    validateFields({ audioUrl: 'http://127.0.0.1:12002/tts-cache/x/a.wav' }, synthReturns, 'result').ok,
    '出参含 audioUrl 应通过',
  );
  console.log('✓ 字段 Schema 校验（required/type/enum/宽松策略/出参）');

  // ──────────────────────────────────────────────
  // 3. PluginResolver：外部目录安装可达
  // ──────────────────────────────────────────────
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human-plugins-node_modules-'));
  const pkgDir = path.join(tmpRoot, 'mock-tts-tool');
  const distDir = path.join(pkgDir, 'dist');
  const configDir = path.join(pkgDir, 'config');
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });

  // 假插件包：CJS、main → dist/index.js、工厂对象导出（与 cmux-tools 同形态）
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'mock-tts-tool', version: '0.1.0', main: 'dist/index.js' }),
  );
  fs.writeFileSync(
    path.join(distDir, 'index.js'),
    [
      '"use strict";',
      'const provider = {',
      '  providerId: "mock-tts",',
      '  createInstance: function (descriptor) {',
      '    return {',
      '      descriptor: descriptor,',
      '      status: "ready",',
      '      execute: async function (capability, params, context) {',
      '        if (capability === "tts.synthesize") {',
      '          return { success: true, data: {',
      '            audioUrl: (context.publicBaseUrl || "http://127.0.0.1:12002") + "/tts-cache/mock-tts/hello.wav",',
      '            durationMs: 1234,',
      '            format: "wav" } };',
      '        }',
      '        if (capability === "tts.voices.list") {',
      '          return { success: true, data: { voices: [{ voiceId: "demo", name: "Demo" }] } };',
  '        }',
      '        return { success: false, error: { code: "CAPABILITY_NOT_FOUND", message: capability } };',
      '      },',
      '    };',
      '  },',
      '};',
      'module.exports = { create: function () { return provider; } };',
    ].join('\n'),
  );
  // 包内 config（motor.tool.install 同步用）
  fs.writeFileSync(
    path.join(configDir, 'mock-tts.json'),
    JSON.stringify({ id: 'mock-tts', category: 'tts', contractVersion: '1.0', type: 'builtin' }),
  );

  try {
    const resolver = new PluginResolver([tmpRoot]);

    // 未安装的包：解析失败（返回 null，importModule 抛错）
    assert.strictEqual(resolver.resolveEntry('definitely-not-installed-pkg'), null);
    await assert.rejects(() => resolver.importModule('definitely-not-installed-pkg'));

    // 外部目录中的包：入口解析 + 加载 + 工厂形态取出 provider + 执行 mock 能力
    const entry = resolver.resolveEntry('mock-tts-tool');
    assert.ok(entry && entry.endsWith(path.join('dist', 'index.js')), `入口应为 dist/index.js: ${entry}`);

    const mod = await resolver.importModule('mock-tts-tool');
    const factory = mod.create as () => { providerId: string };
    const provider = factory();
    assert.strictEqual(provider.providerId, 'mock-tts', '工厂形态应取出 provider');

    const instance = (mod.create as () => any)().createInstance({
      id: 'mock-tts',
      capabilities: [],
    });
    const synth = await instance.execute('tts.synthesize', { text: '你好' }, { sessionId: 'smoke' });
    assert.ok(synth.success && String(synth.data.audioUrl).includes('/tts-cache/mock-tts/'), 'mock synthesize 应返回 tts-cache URL');
    assert.strictEqual(synth.data.durationMs, 1234);

    // 包内相对文件解析（install 同步配置用）
    const cfgPath = resolver.resolvePackageFile('mock-tts-tool', 'config/mock-tts.json');
    assert.ok(cfgPath && fs.existsSync(cfgPath), '应能解析包内 config 文件');
    console.log('✓ PluginResolver：外部目录解析 / 加载 / 工厂 provider / 包内文件');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('\ncontracts-smoke: ALL PASS');
}

main().catch((err) => {
  console.error('\ncontracts-smoke: FAILED');
  console.error(err);
  process.exit(1);
});
