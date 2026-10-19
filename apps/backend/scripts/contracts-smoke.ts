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
  getDefaultRegistry,
  validateFields,
  TTS_CONTRACT_V1,
} from '@human/contracts';
import { PluginResolver } from '../src/motor/motor-tool-runner/core/plugin-resolver';
import { ToolExecutor } from '../src/motor/motor-tool-runner/core/tool-executor';
import { resolveCacheFile } from '../src/motor/motor-tool-runner/tts-cache.controller';

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

  const badReturnSchema = validateFields({ durationMs: 1000 }, synthReturns, 'result');
  assert.ok(!badReturnSchema.ok && badReturnSchema.errors.some((e) => e.includes('audioUrl')), '出参缺 audioUrl 应报错');

  assert.ok(
    validateFields({ audioUrl: 'http://127.0.0.1:12002/tts-cache/x/a.wav' }, synthReturns, 'result').ok,
    '出参含 audioUrl 应通过',
  );

  // voices 数组项强制非空 voiceId（items.fields 对象字段校验）
  const voicesReturns = TTS_CONTRACT_V1.capabilities[1].returns!;
  const emptyVoice = validateFields({ voices: [{}] }, voicesReturns, 'result');
  assert.ok(!emptyVoice.ok, 'voices: [{}]（无 voiceId）应报错');
  assert.ok(
    emptyVoice.errors.some((e) => e.includes('voiceId')),
    '错误信息应指向 voiceId',
  );
  assert.ok(
    validateFields({ voices: [{ voiceId: 'v1', name: 'V1' }] }, voicesReturns, 'result').ok,
    'voices 含非空 voiceId 应通过',
  );
  console.log('✓ 字段 Schema 校验（required/type/enum/宽松策略/出参/voices[].voiceId）');

  // ──────────────────────────────────────────────
  // 2.5 契约基线强制（回归：插件省略 Schema 不能绕过校验）
  // ──────────────────────────────────────────────
  const sneakyDescriptor = {
    id: 'sneaky-tts',
    name: 'Sneaky TTS',
    version: '0.0.1',
    type: 'builtin' as const,
    category: 'tts',
    contractVersion: '1.0',
    // 故意省略参数/返回 Schema —— 旧实现会完全绕过校验
    capabilities: [{ name: 'tts.synthesize' }, { name: 'tts.voices.list' }],
    config: {},
  };
  const sneakyInstance = {
    descriptor: sneakyDescriptor,
    status: 'ready' as const,
    execute: async () => ({ success: true, data: { wrong: 'no audioUrl' } }),
  };
  const legacyDescriptor = {
    id: 'legacy-tool',
    name: 'Legacy',
    version: '1.0.0',
    type: 'builtin' as const,
    capabilities: [{ name: 'do.thing' }],
    config: {},
  };
  const legacyInstance = {
    descriptor: legacyDescriptor,
    status: 'ready' as const,
    execute: async () => ({ success: true, data: { anything: 1 } }),
  };
  const registryStub: { get: (id: string) => any } = {
    get: (id: string) => (id === 'sneaky-tts' ? sneakyInstance : id === 'legacy-tool' ? legacyInstance : undefined),
  };
  const gatewayStub = { emit: async () => undefined };
  const executor = new ToolExecutor(registryStub as any, gatewayStub as any);

  // 缺 text（契约基线拦截，即便 manifest 未声明 Schema）
  const noText = await executor.execute('sneaky-tts', 'tts.synthesize', {}, { sessionId: 'smoke' });
  assert.ok(!noText.success, '缺 text 应被契约基线拦截');
  assert.strictEqual(noText.error?.code, 'PARAMETER_VALIDATION_ERROR');
  assert.ok(String(noText.error?.message).includes('[契约]'), '错误应标注契约来源');

  // 传了 text 但返回坏结果（契约 returns 基线拦截）
  const badReturn = await executor.execute('sneaky-tts', 'tts.synthesize', { text: '你好' }, { sessionId: 'smoke' });
  assert.ok(!badReturn.success, '返回无 audioUrl 应被契约基线拦截');
  assert.strictEqual(badReturn.error?.code, 'CONTRACT_VIOLATION');
  assert.ok(String(badReturn.error?.message).includes('audioUrl'), '错误应指向缺失的 audioUrl');

  // voices.list 返回 [{}]（回归 6：元素缺 voiceId）
  const sneakyVoices = {
    ...sneakyInstance,
    execute: async () => ({ success: true, data: { voices: [{}] } }),
  };
  registryStub.get = (id: string) => (id === 'sneaky-tts' ? sneakyVoices : legacyInstance);
  const badVoices = await executor.execute('sneaky-tts', 'tts.voices.list', {}, { sessionId: 'smoke' });
  assert.ok(!badVoices.success && badVoices.error?.code === 'CONTRACT_VIOLATION', 'voices[0] 缺 voiceId 应被拦截');

  // 无类别存量工具不受契约基线影响
  const legacyOk = await executor.execute('legacy-tool', 'do.thing', {}, { sessionId: 'smoke' });
  assert.ok(legacyOk.success, '无类别存量工具应不受契约校验影响');

  // 单例一致性：加载时与执行时必须同一注册表
  assert.strictEqual(getDefaultRegistry(), getDefaultRegistry(), 'getDefaultRegistry 应为单例');
  console.log('✓ 契约基线强制（省略 Schema 绕过 / 坏返回 / voices[].voiceId / 存量兼容 / 单例）');

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

    // ── 回归 2：CJS 直接 provider 实例（module.exports = provider，无 default 键）──
    const directDir = path.join(tmpRoot, 'direct-provider-tool');
    fs.mkdirSync(directDir, { recursive: true });
    fs.writeFileSync(
      path.join(directDir, 'package.json'),
      JSON.stringify({ name: 'direct-provider-tool', version: '0.1.0', main: 'index.js' }),
    );
    fs.writeFileSync(
      path.join(directDir, 'index.js'),
      '"use strict";\n' +
        'var provider = { providerId: "direct-tts", createInstance: function (d) { return { descriptor: d, status: "ready", execute: async function () { return { success: true }; } }; } };\n' +
        'module.exports = provider;\n',
    );
    const directMod = await resolver.importModule('direct-provider-tool');
    // 与 loadProviderFromModule 相同的候选解析：mod.create ?? mod.default
    const directTarget = directMod.create ?? directMod.default;
    assert.ok(
      directTarget && typeof (directTarget as any).createInstance === 'function',
      'CJS 直接 provider 实例应可经 default 取出（保留 namespace 语义）',
    );

    // ── 回归 3：顶层条件 exports（无 "." 键）──
    const condDir = path.join(tmpRoot, 'cond-exports-tool');
    fs.mkdirSync(condDir, { recursive: true });
    fs.writeFileSync(
      path.join(condDir, 'package.json'),
      JSON.stringify({
        name: 'cond-exports-tool',
        version: '0.1.0',
        exports: { import: './entry.mjs' }, // 顶层条件，无 main/module
      }),
    );
    fs.writeFileSync(
      path.join(condDir, 'entry.mjs'),
      'export default { providerId: "cond-tts" };\n',
    );
    const condEntry = resolver.resolveEntry('cond-exports-tool');
    assert.ok(condEntry && condEntry.endsWith('entry.mjs'), `顶层条件 exports 应解析到 entry.mjs: ${condEntry}`);
    const condMod = await resolver.importModule('cond-exports-tool');
    assert.strictEqual((condMod.default as any)?.providerId, 'cond-tts', '顶层条件 exports 的 ESM 包应可加载');
    console.log('✓ PluginResolver：外部目录解析 / 加载 / 工厂 provider / 包内文件 / CJS 直接实例 / 顶层条件 exports');

    // ──────────────────────────────────────────────
    // 3.5 tts-cache 边界（回归 4：符号链接逃逸）
    // ──────────────────────────────────────────────
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human-tts-cache-'));
    const pluginCacheDir = path.join(cacheRoot, 'mock-tts');
    fs.mkdirSync(pluginCacheDir, { recursive: true });
    fs.writeFileSync(path.join(pluginCacheDir, 'normal.wav'), 'wav-bytes');
    // 缓存外文件 + 缓存内符号链接指向它
    const outsideFile = path.join(os.tmpdir(), `human-outside-${Date.now()}.txt`);
    fs.writeFileSync(outsideFile, 'secret');
    fs.symlinkSync(outsideFile, path.join(pluginCacheDir, 'escape.wav'));

    assert.ok(resolveCacheFile(cacheRoot, 'mock-tts', 'normal.wav'), '正常缓存文件应可解析');
    assert.strictEqual(
      resolveCacheFile(cacheRoot, 'mock-tts', 'escape.wav'),
      null,
      '符号链接指向缓存外应被拒绝',
    );
    assert.strictEqual(resolveCacheFile(cacheRoot, 'mock-tts', '..%2Fescape.wav'), null, '非法文件名应被拒绝');
    assert.strictEqual(resolveCacheFile(cacheRoot, '../..', 'index.json'), null, '非法 pluginId 应被拒绝');
    fs.rmSync(cacheRoot, { recursive: true, force: true });
    fs.rmSync(outsideFile, { force: true });
    console.log('✓ tts-cache 边界（realpath 防符号链接逃逸 / 非法名称）');

    // ──────────────────────────────────────────────
    // 3.6 mock 夹具完整性（回归 5：入口文件必须入库）
    // ──────────────────────────────────────────────
    const fixtureDir = path.resolve(__dirname, '../test-fixtures/mock-tts-tool');
    const fixturePkg = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf-8'));
    const fixtureEntry = path.join(fixtureDir, fixturePkg.main);
    assert.ok(fs.existsSync(fixtureEntry), `夹具入口 ${fixturePkg.main} 必须随仓库分发（不被 dist/ 忽略规则排除）`);
    console.log('✓ mock 夹具完整性（入口文件随仓库分发）');
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
