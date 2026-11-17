/**
 * Brain Basal Ganglia 工具决策路由器端到端冒烟验证（verify:tool-router）
 *
 * 覆盖验收点：
 * 1. [Nest DI 启动] 真实 Nest 容器解析 ToolRoutingLogStore 与 ToolRouterService（无 String 注入阻断）
 * 2. [契约层] router@1.0 类别契约正负向校验与返回值校验（@human/contracts）
 * 3. [降级与 Shadow] 无插件降级（lexical-fallback）与 Shadow 模式透传
 * 4. [错题防污染与失败过滤 (F1)] 仅成功执行的工具记入 actualTools：覆盖直接调用失败、无结果阻断、同工具先败后成、代理调用失败及代理已入选工具
 * 5. [检索防挤出] 积累 205 条无关错题后，最新匹配的成功经验（is_false_negative=0）仍能被检索命中
 * 6. [Active + 快进化] Active 模式拦截 + tool_search 抓漏 + 错题本第二轮秒级纠偏
 * 7. [超时/取消/配置/上下文 (F2/F3/F4)] 宿主超时回退 + 路由阶段取消 + router.status 配置更新与非法值拦截 + 会话前文 contextSummary 自动提取传递
 * 8. [真实 Motor 链路与 3/6 候选准确率 (F5/O1)] 经真实 ToolConfigService + PluginResolver + ToolRegistry + ToolExecutor + MotorToolRunnerService 加载并调用 qwen3-jev-mlx，断言冷热来源、热耗时 <500ms 及 O1 三候选召回
 */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { getDefaultRegistry, validateFields } from '@human/contracts';
import { ToolRoutingLogStore } from '../src/brain/basal-ganglia/tool-routing-log.store';
import { ToolRouterService } from '../src/brain/basal-ganglia/tool-router.service';
import { TOOL_SEARCH_NAME } from '../src/brain/basal-ganglia/tool-search.agent-tool';
import { BrainAgentService } from '../src/brain/agent/brain-agent.service';
import { BrainModule } from '../src/brain/brain.module';
import { AgentSessionStore } from '../src/brain/agent/agent-session.store';
import { ToolConfigService } from '../src/brain/tool-config/tool-config.service';
import { ToolRegistry } from '../src/motor/motor-tool-runner/core/tool-registry';
import { ToolExecutor } from '../src/motor/motor-tool-runner/core/tool-executor';
import { ToolHandler } from '../src/motor/motor-tool-runner/neural/tool-handler';
import { MotorToolRunnerService } from '../src/motor/motor-tool-runner/motor-tool-runner.service';
import { AgentToolAdapter } from '../src/motor/motor-tool-runner/core/agent-tool-adapter';

function makeDummyTool(
  name: string,
  description: string,
  onCall?: (args: any) => any,
): AgentTool {
  return {
    name,
    label: name,
    description,
    parameters: Type.Object({ input: Type.Optional(Type.String()) }),
    prepareArguments: (a) => (typeof a === 'object' && a ? (a as Record<string, unknown>) : {}),
    execute: async (_id, params) => {
      const out = onCall ? onCall(params) : { executed: name, params };
      const isErr = Boolean(out && typeof out === 'object' && out.isError === true);
      return {
        isError: isErr,
        content: [{ type: 'text', text: JSON.stringify(out) }],
        details: out,
      } as any;
    },
    executionMode: 'parallel',
  };
}

async function main() {
  const realHome = os.homedir();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'human-tool-router-smoke-'));
  const dbPath = path.join(tmpDir, 'session.db');

  try {
    // 1. 真实 Nest 容器启动与依赖解析验证（直接启动真实 BrainModule，不提供任何自定义 String provider）
    const appCtx = await NestFactory.createApplicationContext(BrainModule, {
      logger: false,
    });
    try {
      const diStore = appCtx.get(ToolRoutingLogStore);
      const diRouter = appCtx.get(ToolRouterService);
      const diBrainAgent = appCtx.get(BrainAgentService);
      assert.ok(diStore instanceof ToolRoutingLogStore);
      assert.ok(diRouter instanceof ToolRouterService);
      assert.ok(diBrainAgent instanceof BrainAgentService);
    } finally {
      await appCtx.close();
    }
    console.log('✓ 1. 真实 Nest DI 容器启动 BrainModule（ToolRoutingLogStore / ToolRouterService / BrainAgentService）解析通过');

    // 2. 校验 router@1.0 类别契约（含正向与负向校验）
    const registry = getDefaultRegistry();
    const routerContract = registry.get('router', '1.0');
    assert.ok(routerContract, 'ROUTER_CONTRACT_V1 必须注册在默认契约表中');

    const manifestCheck = registry.validateTool({
      id: 'qwen3-jev-mlx',
      category: 'router',
      contractVersion: '1.0',
      capabilities: [{ name: 'router.decide' }],
    });
    assert.equal(manifestCheck.ok, true, manifestCheck.errors.join('; '));

    const badManifestCheck = registry.validateTool({
      id: 'bad-router',
      category: 'router',
      contractVersion: '1.0',
      capabilities: [{ name: 'router.other' }],
    });
    assert.equal(badManifestCheck.ok, false, '缺少必选能力 router.decide 必须校验失败');

    const inputSchema = routerContract.capabilities[0].parameters!;
    const badInputCheck = validateFields({ userText: 123 }, inputSchema, 'params');
    assert.equal(badInputCheck.ok, false, '非法入参必须被契约校验拦截');

    const outputCheck = validateFields(
      {
        selectedToolIds: ['pi-coding-tools.read'],
        scores: [{ toolId: 'pi-coding-tools.read', probability: 0.92 }],
        latencyMs: 38,
        model: 'mlx-community/Qwen3-1.7B-4bit',
      },
      routerContract.capabilities[0].returns!,
      'result',
    );
    assert.equal(outputCheck.ok, true, outputCheck.errors.join('; '));

    const badOutputCheck = validateFields(
      { selectedToolIds: 'not-an-array' },
      routerContract.capabilities[0].returns!,
      'result',
    );
    assert.equal(badOutputCheck.ok, false, '非法返回值必须被契约校验拦截');
    console.log('✓ 2. router@1.0 类别契约正负向出入参校验通过');

    // 3. 构造候选工具池 + 宿主无插件降级测试（lexical-fallback）
    const logStore = new ToolRoutingLogStore(dbPath);
    const routerNoPlugin = new ToolRouterService(undefined, logStore);

    const invokedByProxy: string[] = [];
    const candidateTools: AgentTool[] = [
      makeDummyTool('pi-coding-tools.read', '读取本地文件内容'),
      makeDummyTool('pi-coding-tools.write', '写入或修改本地文件', (args) => {
        if (args?.fail) {
          return { isError: true, ok: false, error: 'permission denied' };
        }
        return { written: true };
      }),
      makeDummyTool('pi-coding-tools.bash', '执行终端 bash 命令'),
      makeDummyTool('qwen3-mlx.tts.synthesize', '将文本合成为中文语音播报音频'),
      makeDummyTool('cmux.workspace.list', '列出 cmux 终端工作区列表'),
      makeDummyTool('stealth-audit.scan', '扫描深层隐秘安全合规项', (args) => {
        invokedByProxy.push(`stealth-audit.scan:${JSON.stringify(args)}`);
        return { auditPassed: true };
      }),
      makeDummyTool('qwen3-jev-mlx.router.decide', '内部路由器自身能力'),
    ];

    const shadowPrep = await routerNoPlugin.prepareToolsForRun({
      userText: '帮我读取 package.json 文件并用语音播报',
      allTools: candidateTools,
      mode: 'shadow',
      topK: 2,
      threshold: 0.3,
    });
    assert.equal(shadowPrep.tools.length, 6, 'Shadow 模式必须返回全部 6 个业务工具（排除内部 router.decide）');
    assert.equal(shadowPrep.decision.routerSource, 'lexical-fallback');
    assert.ok(shadowPrep.decision.selectedToolIds.includes('pi-coding-tools.read'));
    assert.ok(shadowPrep.decision.selectedToolIds.includes('qwen3-mlx.tts.synthesize'));
    console.log('✓ 3. 无插件优雅降级（lexical-fallback）与 Shadow 模式透传验证通过');

    // 4. [错题防污染与失败过滤 (F1)]
    // 4a. tool_search 代理调用已入选工具不标记为错题
    const alreadySelectedPrep = await routerNoPlugin.prepareToolsForRun({
      userText: '读取本地文件内容',
      allTools: candidateTools,
      mode: 'active',
      topK: 2,
      threshold: 0.3,
    });
    assert.ok(alreadySelectedPrep.decision.selectedToolIds.includes('pi-coding-tools.read'));
    const tsAlready = alreadySelectedPrep.tools.find((t) => t.name === TOOL_SEARCH_NAME)!;
    await tsAlready.execute(
      'call-already',
      { callTool: 'pi-coding-tools.read', callArgs: { input: 'README.md' } },
      undefined,
      undefined,
    );
    const nonFnLog = routerNoPlugin.recordRunOutcome({
      sessionId: 'sess-no-pollute',
      requestId: 'req-no-pollute',
      userText: '读取本地文件内容',
      prepared: alreadySelectedPrep,
      newMessages: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'c0', name: TOOL_SEARCH_NAME }] }],
    });
    assert.ok(nonFnLog);
    assert.deepEqual(nonFnLog!.actualTools, ['pi-coding-tools.read']);
    assert.deepEqual(nonFnLog!.falseNegatives, []);
    assert.equal(nonFnLog!.isFalseNegative, false, '代理调用已入选工具绝不能标记为错题');

    // 4b. 直接调用失败（isError=true）、无 toolResult 的未完成调用、代理调用失败均不得记入 actualTools
    const f1Prep = await routerNoPlugin.prepareToolsForRun({
      userText: '读取本地文件内容',
      allTools: candidateTools,
      mode: 'active',
      topK: 2,
      threshold: 0.3,
    });
    const tsF1 = f1Prep.tools.find((t) => t.name === TOOL_SEARCH_NAME)!;
    // 代理调用失败（fail: true -> isError: true / ok: false）
    await tsF1.execute(
      'call-proxy-fail',
      { callTool: 'pi-coding-tools.write', callArgs: { fail: true } },
      undefined,
      undefined,
    );
    assert.equal(
      f1Prep.searchTracker.invokedHiddenTools.includes('pi-coding-tools.write'),
      false,
      '代理执行失败的隐藏工具不得加入 invokedHiddenTools',
    );

    const f1FailedLog = routerNoPlugin.recordRunOutcome({
      sessionId: 'sess-f1-fail',
      requestId: 'req-f1-fail',
      userText: '读取本地文件内容',
      prepared: f1Prep,
      newMessages: [
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'bad1', name: 'pi-coding-tools.write' },
            { type: 'toolCall', id: 'unfin1', name: 'cmux.workspace.list' },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'bad1',
          toolName: 'pi-coding-tools.write',
          isError: true,
          content: [{ type: 'text', text: 'permission denied' }],
        },
      ],
    });
    assert.ok(f1FailedLog);
    assert.deepEqual(f1FailedLog!.actualTools, [], '失败或未完成的工具调用绝不能进入 actualTools');
    assert.deepEqual(f1FailedLog!.falseNegatives, []);
    assert.equal(f1FailedLog!.isFalseNegative, false);

    // 4c. 同一未入选工具先失败（bad1）再成功（good2），应当记入 actualTools 并标记为错题
    const f1RetryLog = routerNoPlugin.recordRunOutcome({
      sessionId: 'sess-f1-retry',
      requestId: 'req-f1-retry',
      userText: '读取本地文件内容',
      prepared: f1Prep,
      newMessages: [
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'bad1', name: 'cmux.workspace.list' },
            { type: 'toolCall', id: 'good2', name: 'cmux.workspace.list' },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'bad1',
          toolName: 'cmux.workspace.list',
          isError: true,
          content: [{ type: 'text', text: 'error' }],
        },
        {
          role: 'toolResult',
          toolCallId: 'good2',
          isError: false,
          content: [{ type: 'text', text: 'ok' }],
        },
      ],
    });
    assert.ok(f1RetryLog);
    assert.deepEqual(f1RetryLog!.actualTools, ['cmux.workspace.list']);
    assert.equal(f1RetryLog!.isFalseNegative, true);

    // 4d. 真实 AgentToolAdapter 转换的 Motor 失败工具（返回 { success: false, error: { code, message } }）
    const failingMotorTool = new AgentToolAdapter(
      {
        descriptor: {
          id: 'real-motor-fail',
          name: 'RealMotorFail',
          version: '1.0.0',
          origin: 'core',
          execution: 'builtin',
          capabilities: [{ name: 'run', description: '模拟真实 Motor 失败能力' }],
        },
        status: 'ready',
        execute: async () => ({
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'real motor failure' },
        }),
      } as any,
      { name: 'run', description: '模拟真实 Motor 失败能力' },
      async () => ({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: 'real motor failure' },
      }),
    ).createAgentTool();

    const f1MotorTools = [...candidateTools, failingMotorTool];
    const f1MotorPrep = await routerNoPlugin.prepareToolsForRun({
      userText: '读取本地文件内容',
      allTools: f1MotorTools,
      mode: 'active',
      topK: 2,
      threshold: 0.3,
    });
    const tsMotorFail = f1MotorPrep.tools.find((t) => t.name === TOOL_SEARCH_NAME)!;
    const adapterExecRes = await tsMotorFail.execute(
      'call-real-motor-fail',
      { callTool: 'real-motor-fail.run', callArgs: {} },
      undefined,
      undefined,
    );
    assert.equal((adapterExecRes as any).isError, true, 'AgentToolAdapter 失败结果必须标记 isError=true');
    assert.equal(
      f1MotorPrep.searchTracker.invokedHiddenTools.includes('real-motor-fail.run'),
      false,
      '真实 AgentToolAdapter 失败调用不得进入 invokedHiddenTools',
    );
    // 模拟经 pi-agent-core createToolResultMessage 剥离 terminate 后的历史消息
    const f1MotorLog = routerNoPlugin.recordRunOutcome({
      sessionId: 'sess-f1-motor-adapter',
      requestId: 'req-f1-motor-adapter',
      userText: '读取本地文件内容',
      prepared: f1MotorPrep,
      newMessages: [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'mfail-1', name: 'real-motor-fail.run' }],
        },
        {
          role: 'toolResult',
          toolCallId: 'mfail-1',
          toolName: 'real-motor-fail.run',
          content: adapterExecRes.content,
          details: adapterExecRes.details,
          isError: (adapterExecRes as any).isError === true,
        },
      ],
    });
    assert.ok(f1MotorLog);
    assert.deepEqual(f1MotorLog!.actualTools, [], '真实 Motor 适配器失败工具绝不能进入 actualTools');
    assert.deepEqual(f1MotorLog!.falseNegatives, []);
    assert.equal(f1MotorLog!.isFalseNegative, false);

    // 4e. 真实 AgentToolAdapter 成功返回业务数据含 { code: "OK", message: "operation completed" } 时，绝不能误判为失败 (human-3ih)
    const succeedingCodeMsgMotorTool = new AgentToolAdapter(
      {
        descriptor: {
          id: 'real-motor-ok-code',
          name: 'RealMotorOkCode',
          version: '1.0.0',
          origin: 'core',
          execution: 'builtin',
          capabilities: [{ name: 'run', description: '返回含 code/message 的成功业务数据' }],
        },
        status: 'ready',
        execute: async () => ({
          success: true,
          data: { code: 'OK', message: 'operation completed', error: '' },
        }),
      } as any,
      { name: 'run', description: '返回含 code/message 的成功业务数据' },
      async () => ({
        success: true,
        data: { code: 'OK', message: 'operation completed', error: '' },
      }),
    ).createAgentTool();

    const f1OkMotorTools = [...candidateTools, succeedingCodeMsgMotorTool];
    const f1OkMotorPrep = await routerNoPlugin.prepareToolsForRun({
      userText: '读取本地文件内容',
      allTools: f1OkMotorTools,
      mode: 'active',
      topK: 2,
      threshold: 0.3,
    });
    const tsMotorOk = f1OkMotorPrep.tools.find((t) => t.name === TOOL_SEARCH_NAME)!;
    const adapterOkExecRes = await tsMotorOk.execute(
      'call-real-motor-ok',
      { callTool: 'real-motor-ok-code.run', callArgs: {} },
      undefined,
      undefined,
    );
    assert.equal(Boolean((adapterOkExecRes as any).isError), false);
    assert.equal(
      f1OkMotorPrep.searchTracker.invokedHiddenTools.includes('real-motor-ok-code.run'),
      true,
      '返回 {code:"OK", message:"..."} 的成功代理调用必须记入 invokedHiddenTools',
    );
    // 同时验证直接调用产生含 details: {code:"OK", message:"operation completed"} 的 toolResult 时准确记入 actualTools 与 falseNegatives
    const f1DirectOkMotorPrep = await routerNoPlugin.prepareToolsForRun({
      userText: '读取本地文件内容',
      allTools: f1OkMotorTools,
      mode: 'shadow',
      topK: 2,
      threshold: 0.3,
    });
    const f1OkMotorLog = routerNoPlugin.recordRunOutcome({
      sessionId: 'sess-f1-motor-ok-code',
      requestId: 'req-f1-motor-ok-code',
      userText: '读取本地文件内容',
      prepared: f1DirectOkMotorPrep,
      newMessages: [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'mok-1', name: 'real-motor-ok-code.run' }],
        },
        {
          role: 'toolResult',
          toolCallId: 'mok-1',
          toolName: 'real-motor-ok-code.run',
          content: adapterOkExecRes.content,
          details: adapterOkExecRes.details,
          isError: false,
        },
      ],
    });
    assert.ok(f1OkMotorLog);
    assert.deepEqual(
      f1OkMotorLog!.actualTools,
      ['real-motor-ok-code.run'],
      '含 {code:"OK", message:"..."} 的成功工具调用必须记入 actualTools',
    );
    assert.deepEqual(f1OkMotorLog!.falseNegatives, ['real-motor-ok-code.run']);
    assert.equal(f1OkMotorLog!.isFalseNegative, true);
    console.log('✓ 4. 失败调用过滤（含真实 AgentToolAdapter 成功/失败区分，F1 & human-3ih）与已入选工具代理防污染验证通过');

    // 5. [检索防挤出] 写入 205 条无关错题 + 1 条最新匹配成功经验，验证成功经验不被挤出
    const quotaStore = new ToolRoutingLogStore(path.join(tmpDir, 'quota.db'));
    for (let i = 0; i < 205; i++) {
      quotaStore.recordLog({
        sessionId: 'sess-noise',
        requestId: `req-noise-${i}`,
        mode: 'active',
        userText: `无关错题样本编号 ${i} 处理星际航行跃迁引擎`,
        candidateCount: 6,
        predictedTools: ['pi-coding-tools.write'],
        scores: [],
        actualTools: ['cmux.workspace.list'],
        searchedQueries: [],
        falseNegatives: ['cmux.workspace.list'],
        isFalseNegative: true,
        routerSource: 'lexical-fallback',
        latencyMs: 5,
        createdAt: 1000 + i,
      });
    }
    const recentSuccess = quotaStore.recordLog({
      sessionId: 'sess-ok',
      requestId: 'req-ok-latest',
      mode: 'shadow',
      userText: '部署前执行月度财务对账流水核验',
      candidateCount: 6,
      predictedTools: ['pi-coding-tools.read'],
      scores: [],
      actualTools: ['pi-coding-tools.read'],
      searchedQueries: [],
      falseNegatives: [],
      isFalseNegative: false,
      routerSource: 'lexical-fallback',
      latencyMs: 4,
      createdAt: 5000,
    });
    const quotaMatched = quotaStore.findSimilarExamples('请执行月度财务对账流水核验', 2);
    assert.ok(quotaMatched.length > 0, '205 条无关错题后仍必须能检索到最新匹配的成功经验');
    assert.equal(quotaMatched[0].id, recentSuccess.id);
    console.log('✓ 5. 200+ 条错题下近期成功经验配额保留与检索命中验证通过');

    // 6. Active 模式 + tool_search 抓漏 + 错题本秒级自进化闭环
    const evolveStore = new ToolRoutingLogStore(path.join(tmpDir, 'evolve.db'));
    const routerEvolve = new ToolRouterService(undefined, evolveStore);
    const obscurePrompt = '帮我做一次发版前红线体检';
    const activePrepRound1 = await routerEvolve.prepareToolsForRun({
      userText: obscurePrompt,
      allTools: candidateTools,
      mode: 'active',
      topK: 2,
      threshold: 0.4,
    });
    assert.ok(!activePrepRound1.decision.selectedToolIds.includes('stealth-audit.scan'));
    const toolSearchTool = activePrepRound1.tools.find((t) => t.name === TOOL_SEARCH_NAME)!;
    await toolSearchTool.execute('call-1', { query: '安全 合规' }, undefined, undefined);
    await toolSearchTool.execute(
      'call-2',
      { callTool: 'stealth-audit.scan', callArgs: { input: 'release-v1' } },
      undefined,
      undefined,
    );
    const fnEntry = routerEvolve.recordRunOutcome({
      sessionId: 'sess-evolve-1',
      requestId: 'req-evolve-1',
      userText: obscurePrompt,
      prepared: activePrepRound1,
      newMessages: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'c2', name: TOOL_SEARCH_NAME }] }],
    });
    assert.equal(fnEntry?.isFalseNegative, true);
    assert.deepEqual(fnEntry?.falseNegatives, ['stealth-audit.scan']);

    const activePrepRound2 = await routerEvolve.prepareToolsForRun({
      userText: '现在再做一次发版前红线体检',
      allTools: candidateTools,
      mode: 'active',
      topK: 2,
      threshold: 0.4,
    });
    assert.ok(activePrepRound2.decision.matchedHistoryIds.includes(fnEntry!.id));
    assert.ok(activePrepRound2.decision.selectedToolIds.includes('stealth-audit.scan'));
    console.log('✓ 6. Active 模式拦截 + tool_search 抓漏代理执行 + 错题本秒级自进化验证通过');

    // 7. 宿主级路由超时预算、路由阶段取消、router.status 在线配置校验（F3）及会话上下文传递（F4）
    let hungPluginSignalAborted = false;
    const hungMotor: any = {
      handleCommand: async (msg: any) => {
        if (msg.topic === 'motor.tool.list') {
          return {
            success: true,
            data: { tools: [{ id: 'slow-router', status: 'ready', capabilities: ['router.decide'] }] },
          };
        }
        const sig: AbortSignal | undefined = msg.payload?.signal;
        return await new Promise((resolve) => {
          const t = setTimeout(() => resolve({ success: true }), 10000);
          sig?.addEventListener(
            'abort',
            () => {
              hungPluginSignalAborted = true;
              clearTimeout(t);
              resolve({ success: false, msg: 'aborted' });
            },
            { once: true },
          );
        });
      },
    };
    const routerWithHungPlugin = new ToolRouterService(hungMotor, logStore);
    const tTimeoutStart = Date.now();
    const timeoutFallbackPrep = await routerWithHungPlugin.prepareToolsForRun({
      userText: '读取本地文件 package.json',
      allTools: candidateTools,
      mode: 'shadow',
      routeTimeoutMs: 60,
    });
    const timeoutElapsed = Date.now() - tTimeoutStart;
    assert.ok(timeoutElapsed < 500, `路由超时应在预算内快速回退，实际耗时 ${timeoutElapsed}ms`);
    assert.equal(hungPluginSignalAborted, true, '超时后必须向插件传递 abort 信号');
    assert.equal(timeoutFallbackPrep.decision.routerSource, 'lexical-fallback');
    assert.equal(timeoutFallbackPrep.tools.length, 6);

    // 验证在 BrainAgentService 路由阶段发起 brain.agent.run.cancel 能立即中断，并验证 F3 配置接口与 F4 上下文传递
    hungPluginSignalAborted = false;
    const routerSlowForCancel = new ToolRouterService(hungMotor, logStore);
    routerSlowForCancel.setConfig({ routeTimeoutMs: 10000 });
    const prevHomeCancel = process.env.HOME;
    process.env.HOME = tmpDir;
    try {
      const dummyCore: any = {
        registerInternalActor: () => {},
        registerCapabilities: () => {},
        findSubscribers: () => [],
      };
      const dummyWs: any = { sendToConnection: () => {} };
      const dummyHttp: any = { registerCommandHandler: () => {} };
      const dummyLlm: any = {
        resolveModel: async () => ({ profileName: 'test', profile: {}, model: {} }),
      };
      const dummyModelCfg: any = {};
      const dummyAuth: any = { resolveApiKey: async () => 'key' };
      const sessionStore = new AgentSessionStore();
      const dummyAdapter: any = { getAllTools: () => candidateTools };
      const dummySpeech: any = { synthesize: async () => undefined };

      const brainAgent = new BrainAgentService(
        dummyCore,
        dummyWs,
        dummyHttp,
        dummyLlm,
        dummyModelCfg,
        dummyAuth,
        sessionStore,
        dummyAdapter,
        dummySpeech,
        routerSlowForCancel,
      );

      // 7a. 路由等待阶段取消
      const tCancelStart = Date.now();
      const runPromise = brainAgent.handleCommand({
        id: 'run-cancel-in-route',
        kind: 'command',
        topic: 'brain.agent.run',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: {
          runId: 'run-cancel-in-route',
          sessionId: 'sess-cancel-route',
          userText: '帮我读取文件并播报',
          routerMode: 'shadow',
        },
      });

      await new Promise((r) => setTimeout(r, 40));
      const cancelRes = await brainAgent.handleCommand({
        id: 'cancel-cmd',
        kind: 'command',
        topic: 'brain.agent.run.cancel',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { runId: 'run-cancel-in-route' },
      });
      assert.equal(cancelRes.success, true);

      const runRes = await runPromise;
      const cancelElapsed = Date.now() - tCancelStart;
      assert.equal(runRes.success, false);
      assert.match(runRes.msg || '', /cancelled/i);
      assert.equal(hungPluginSignalAborted, true, '取消必须中断正在等待的路由插件调用');
      assert.ok(cancelElapsed < 500, `路由期间取消应立即返回，实际耗时 ${cancelElapsed}ms`);

      // 7b. [F3] 验证 brain.agent.router.status 支持 mode / setMode、独立字段更新与非法值拦截
      const statusUpdate1: any = await brainAgent.handleCommand({
        id: 'status-upd-1',
        kind: 'query',
        topic: 'brain.agent.router.status',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { mode: 'active', topK: 5, routeTimeoutMs: 3000 },
      });
      assert.equal(statusUpdate1.success, true);
      assert.equal(statusUpdate1.data.config.mode, 'active');
      assert.equal(statusUpdate1.data.config.topK, 5);
      assert.equal(statusUpdate1.data.config.routeTimeoutMs, 3000);

      // 仅更新 threshold 与 minCandidates（不传 mode）
      const statusUpdate2: any = await brainAgent.handleCommand({
        id: 'status-upd-2',
        kind: 'query',
        topic: 'brain.agent.router.status',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { threshold: 0.35, minCandidates: 4 },
      });
      assert.equal(statusUpdate2.success, true);
      assert.equal(statusUpdate2.data.config.mode, 'active');
      assert.equal(statusUpdate2.data.config.threshold, 0.35);
      assert.equal(statusUpdate2.data.config.minCandidates, 4);

      // 非法 mode 与超契约上限的 topK (>64) 应报错拒绝
      const badStatusRes: any = await brainAgent.handleCommand({
        id: 'status-bad',
        kind: 'query',
        topic: 'brain.agent.router.status',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { mode: 'invalid-mode' },
      });
      assert.equal(badStatusRes.success, false);
      assert.match(badStatusRes.msg || '', /payload\.mode/);

      const badTopKStatusRes: any = await brainAgent.handleCommand({
        id: 'status-bad-topk',
        kind: 'query',
        topic: 'brain.agent.router.status',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { topK: 65 },
      });
      assert.equal(badTopKStatusRes.success, false, '超过 router@1.0 契约上限 64 的 topK 必须拒绝');
      assert.match(badTopKStatusRes.msg || '', /1 and 64/);

      const badTopKDecideRes: any = await brainAgent.handleCommand({
        id: 'decide-bad-topk',
        kind: 'command',
        topic: 'brain.agent.router.decide',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { userText: '测试', topK: 80 },
      });
      assert.equal(badTopKDecideRes.success, false, 'router.decide 超过 64 的 topK 必须拒绝');
      assert.match(badTopKDecideRes.msg || '', /1 and 64/);

      // 7c. [F4] 验证会话前文 contextSummary 提取与路由传递
      sessionStore.upsertSession({
        sessionId: 'sess-ctx-carry',
        profileName: 'test',
        systemPrompt: 'sys',
        speechSummaryEnabled: false,
        messages: [
          { role: 'user', content: '帮我读取 package.json 并用语音播报' },
          {
            role: 'assistant',
            content: [
              { type: 'toolCall', id: 'tc-r1', name: 'pi-coding-tools.read' },
              { type: 'toolCall', id: 'tc-t1', name: 'qwen3-mlx.tts.synthesize' },
            ],
          },
          {
            role: 'toolResult',
            toolCallId: 'tc-r1',
            toolName: 'pi-coding-tools.read',
            isError: false,
            content: [{ type: 'text', text: '{}' }],
          },
          {
            role: 'toolResult',
            toolCallId: 'tc-t1',
            toolName: 'qwen3-mlx.tts.synthesize',
            isError: false,
            content: [{ type: 'text', text: 'audio.wav' }],
          },
        ],
        requestId: 'req-prev',
        eventCount: 4,
      });

      let capturedCtxSummary: string | undefined;
      const spyRouter: any = {
        prepareToolsForRun: async (opts: any) => {
          capturedCtxSummary = opts.contextSummary;
          return await routerNoPlugin.prepareToolsForRun(opts);
        },
      };
      const brainAgentWithSpy = new BrainAgentService(
        dummyCore,
        dummyWs,
        dummyHttp,
        dummyLlm,
        dummyModelCfg,
        dummyAuth,
        sessionStore,
        dummyAdapter,
        dummySpeech,
        spyRouter,
      );
      const persistedSession = sessionStore.loadSessionFile('sess-ctx-carry');
      const extractedSummary = (brainAgentWithSpy as any).extractRoutingContextSummary(
        persistedSession?.messages ?? [],
      );
      assert.ok(extractedSummary, '必须从历史消息提取非空 contextSummary');
      assert.match(extractedSummary!, /pi-coding-tools\.read/);
      assert.match(extractedSummary!, /qwen3-mlx\.tts\.synthesize/);

      const builtWithCtx = await (brainAgentWithSpy as any).buildToolsWithRouting({
        toolPreset: 'default',
        userText: '按刚才的方法再处理 tsconfig.json',
        contextSummary: extractedSummary,
        routerMode: 'active',
      });
      assert.equal(capturedCtxSummary, extractedSummary);
      assert.ok(
        builtWithCtx.preparedRouting.decision.selectedToolIds.includes('pi-coding-tools.read'),
        '携带会话前文摘要时，指代请求应命中上一轮成功调用的 read 工具',
      );
      assert.ok(
        builtWithCtx.preparedRouting.decision.selectedToolIds.includes('qwen3-mlx.tts.synthesize'),
        '携带会话前文摘要时，指代请求应命中上一轮成功调用的 tts 工具',
      );
    } finally {
      process.env.HOME = prevHomeCancel;
    }
    console.log('✓ 7. 宿主超时回退、路由期取消、router.status 配置校验（F3）及会话前文传递（F4）验证通过');

    // 8. 真实 Motor 链路：ToolConfigService + PluginResolver + ToolRegistry + ToolExecutor + MotorToolRunnerService
    const realPluginConfig = path.join(realHome, '.ai_secretary/tools/tools/qwen3-jev-mlx.json');
    if (!fs.existsSync(realPluginConfig)) {
      if (process.env.ALLOW_SKIP_REAL_MLX === '1') {
        console.log('⚠ 8. [SKIP] 未检测到 ~/.ai_secretary/tools/tools/qwen3-jev-mlx.json（ALLOW_SKIP_REAL_MLX=1）');
        console.log('\ntool-router-smoke: 7 GATES PASS, 1 SKIPPED');
        return;
      }
      assert.fail(`Gate 8 失败：未找到真实路由插件配置 ${realPluginConfig}`);
    }

    process.env.HOME = realHome;
    const dummyGateway: any = {
      register: () => {},
      registerToolCapabilities: () => {},
      emit: async () => {},
      publishToolStart: () => {},
      publishToolResult: () => {},
      publishToolError: () => {},
    };
    const toolRegistry = new ToolRegistry();
    const toolExecutor = new ToolExecutor(toolRegistry, dummyGateway);
    const toolHandler = new ToolHandler(toolExecutor, toolRegistry);
    const dummyHttp: any = { registerCommandHandler: () => {} };
    const dummyPiCoding: any = {
      providerId: 'pi-coding-tools',
      createInstance: () => ({
        descriptor: { id: 'pi-coding-tools', capabilities: [] },
        status: 'ready',
        execute: async () => ({ success: true }),
      }),
    };
    const dummySysSession: any = {
      providerId: 'system-session-tools',
      createInstance: () => ({
        descriptor: { id: 'system-session-tools', capabilities: [] },
        status: 'ready',
        execute: async () => ({ success: true }),
      }),
    };

    const toolConfigService = new ToolConfigService();
    const moduleRef: any = {
      get: (token: any) => (token === ToolConfigService ? toolConfigService : undefined),
    };

    const realMotor = new MotorToolRunnerService(
      toolRegistry,
      toolExecutor,
      dummyGateway,
      toolHandler,
      dummyHttp,
      dummyPiCoding,
      dummySysSession,
      moduleRef,
    );

    await realMotor.onModuleInit();
    try {
      const listRes: any = await realMotor.handleCommand({
        id: 'list-routers',
        kind: 'query',
        topic: 'motor.tool.list',
        source: { actorId: 'test', runtime: 'nest', system: 'brain', module: 'test' },
        timestamp: Date.now(),
        payload: { category: 'router', detailed: true },
      });
      assert.equal(listRes.success, true);
      const foundRouter = listRes.data?.tools?.find((t: any) => t.id === 'qwen3-jev-mlx');
      assert.ok(foundRouter, '真实 Motor 必须从 ~/.ai_secretary 发现并加载 qwen3-jev-mlx 插件');
      assert.equal(foundRouter.category, 'router');

      // 隔离空 logStore 测试纯模型冷/热推理与 O1 三候选用例
      const cleanMlxStore = new ToolRoutingLogStore(path.join(tmpDir, 'mlx-clean.db'));
      const routerWithRealMotor = new ToolRouterService(realMotor, cleanMlxStore);
      routerWithRealMotor.setConfig({ routeTimeoutMs: 15000 });

      const qwenDecision1 = await routerWithRealMotor.decide({
        userText: '帮我读取 package.json 文件的内容，然后用语音播报出来。',
        candidates: candidateTools
          .filter((t) => !t.name.endsWith('.router.decide'))
          .map((t) => ({ toolId: t.name, description: t.description })),
        topK: 3,
        threshold: 0.3,
      });
      const qwenDecision2 = await routerWithRealMotor.decide({
        userText: '在终端运行 ls 命令查看目录',
        candidates: candidateTools
          .filter((t) => !t.name.endsWith('.router.decide'))
          .map((t) => ({ toolId: t.name, description: t.description })),
        topK: 2,
        threshold: 0.3,
      });

      // O1 回归：三候选池「帮我读取 package.json 文件并用语音播报」topK=2, threshold=0.3
      const qwenDecision3 = await routerWithRealMotor.decide({
        userText: '帮我读取 package.json 文件并用语音播报',
        candidates: [
          { toolId: 'pi-coding-tools.read', description: '读取本地文件内容' },
          { toolId: 'pi-coding-tools.bash', description: '执行终端 bash 命令' },
          { toolId: 'qwen3-mlx.tts.synthesize', description: '将文本合成为中文语音播报音频' },
        ],
        topK: 2,
        threshold: 0.3,
      });

      assert.equal(
        qwenDecision1.routerSource,
        'qwen3-jev-mlx:mlx-community/Qwen3-1.7B-4bit',
        '冷启动调用必须来自真实 qwen3-jev-mlx 插件',
      );
      assert.equal(
        qwenDecision2.routerSource,
        'qwen3-jev-mlx:mlx-community/Qwen3-1.7B-4bit',
        '热推理调用必须来自真实 qwen3-jev-mlx 插件而非回退内置路由',
      );
      assert.equal(
        qwenDecision3.routerSource,
        'qwen3-jev-mlx:mlx-community/Qwen3-1.7B-4bit',
        '三候选用例必须来自真实 qwen3-jev-mlx 插件',
      );
      assert.ok(
        qwenDecision2.latencyMs < 500,
        `热推理耗时必须 < 500ms，实际 ${qwenDecision2.latencyMs}ms`,
      );
      assert.ok(qwenDecision1.selectedToolIds.includes('pi-coding-tools.read'));
      assert.ok(qwenDecision1.selectedToolIds.includes('qwen3-mlx.tts.synthesize'));
      assert.ok(qwenDecision2.selectedToolIds.includes('pi-coding-tools.bash'));
      assert.deepEqual(
        new Set(qwenDecision3.selectedToolIds),
        new Set(['qwen3-mlx.tts.synthesize', 'pi-coding-tools.read']),
        `O1 三候选用例必须同时选中 read 与 tts，实际选中: ${JSON.stringify(qwenDecision3.selectedToolIds)}`,
      );
      console.log(
        `✓ 8. 真实 Motor 加载并执行 qwen3-jev-mlx 通过（冷启动=${qwenDecision1.latencyMs}ms，6候选热推理=${qwenDecision2.latencyMs}ms，3候选热推理=${qwenDecision3.latencyMs}ms）`,
      );
    } finally {
      await realMotor.onModuleDestroy();
    }

    console.log('\ntool-router-smoke: ALL 8 GATES PASS');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('tool-router-smoke FAILED:', err);
    process.exit(1);
  });
