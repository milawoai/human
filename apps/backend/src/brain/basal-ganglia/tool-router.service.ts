import { Injectable, Logger, Optional } from '@nestjs/common';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { MotorToolRunnerService } from '../../motor/motor-tool-runner/motor-tool-runner.service';
import {
  ToolRoutingLogStore,
  ToolRoutingScoreItem,
  ToolRoutingLogEntry,
  FewShotRoutingExample,
} from './tool-routing-log.store';
import {
  createToolSearchAgentTool,
  isToolExecutionError,
  TOOL_SEARCH_NAME,
  ToolSearchTracker,
} from './tool-search.agent-tool';

export type ToolRouterMode = 'off' | 'shadow' | 'active';

export interface ToolCandidateMeta {
  toolId: string;
  category?: string;
  description: string;
}

export interface ToolRouteDecision {
  mode: ToolRouterMode;
  selectedToolIds: string[];
  scores: ToolRoutingScoreItem[];
  matchedHistoryIds: string[];
  routerSource: string;
  latencyMs: number;
}

export interface PreparedAgentToolsResult {
  /** 实际传给 Agent 的工具列表（shadow/off 为全量，active 为 Top-K + tool_search） */
  tools: AgentTool[];
  /** 路由决策详情（供日志与会后对比） */
  decision: ToolRouteDecision;
  /** 供 tool_search 记录搜索与隐藏调用的追踪器 */
  searchTracker: ToolSearchTracker;
  /** 过滤掉内部 router 插件后的业务候选工具总数 */
  candidateCount: number;
}

/**
 * Brain 基底节（Basal Ganglia）—— 工具决策路由器服务
 *
 * 职责：
 * 1. 会前筛选（prepareToolsForRun）：
 *    - 自动过滤内部 `router` 类别工具，避免将路由器自身暴露给主脑 Agent
 *    - 检索 SQLite 错题本与历史相似经验（动态 Few-shot 快进化）
 *    - 优先调用已安装的 `router@1.0` 插件（如本地 `qwen3-jev-mlx`）；
 *      若未安装或未启用插件，无感回退到宿主内置的零依赖词汇+错题打分器（`lexical-fallback`）
 *    - 支持 `off` / `shadow`（默认影子模式，旁路记日志不拦截）/ `active`（仅挂载 Top-K + `tool_search`）
 * 2. 会后反馈采集（recordRunOutcome）：
 *    - 扫描本轮主脑实际调用的工具集 A，与预测集 R 比对
 *    - 若发生漏选（t ∈ A \ R 或触发了 `tool_search`），自动打标 `is_false_negative = 1` 入错题本
 */
@Injectable()
export class ToolRouterService {
  private readonly logger = new Logger(ToolRouterService.name);
  private modeOverride?: ToolRouterMode;
  private topKOverride?: number;
  private thresholdOverride?: number;
  private minCandidatesOverride?: number;
  private routeTimeoutMsOverride?: number;

  constructor(
    @Optional() private readonly motor?: MotorToolRunnerService,
    @Optional() private readonly logStore?: ToolRoutingLogStore,
  ) {}

  getMode(): ToolRouterMode {
    if (this.modeOverride) return this.modeOverride;
    const envMode = (process.env.HUMAN_TOOL_ROUTER_MODE || 'shadow').toLowerCase().trim();
    if (envMode === 'off' || envMode === 'active' || envMode === 'shadow') {
      return envMode;
    }
    return 'shadow';
  }

  setConfig(options: {
    mode?: ToolRouterMode;
    topK?: number;
    threshold?: number;
    minCandidates?: number;
    routeTimeoutMs?: number;
  }): void {
    if (options.mode) this.modeOverride = options.mode;
    if (typeof options.topK === 'number' && Number.isFinite(options.topK)) {
      this.topKOverride = Math.min(64, Math.max(1, Math.trunc(options.topK)));
    }
    if (typeof options.threshold === 'number' && Number.isFinite(options.threshold)) {
      this.thresholdOverride = Math.min(1, Math.max(0, options.threshold));
    }
    if (typeof options.minCandidates === 'number' && Number.isFinite(options.minCandidates)) {
      this.minCandidatesOverride = Math.min(100, Math.max(1, Math.trunc(options.minCandidates)));
    }
    if (typeof options.routeTimeoutMs === 'number' && Number.isFinite(options.routeTimeoutMs)) {
      this.routeTimeoutMsOverride = Math.max(20, Math.trunc(options.routeTimeoutMs));
    }
  }

  getConfig() {
    return {
      mode: this.getMode(),
      topK: this.getTopK(),
      threshold: this.getThreshold(),
      minCandidates: this.getMinCandidates(),
      routeTimeoutMs: this.getRouteTimeoutMs(),
    };
  }

  private getTopK(): number {
    if (typeof this.topKOverride === 'number') return this.topKOverride;
    const envVal = Number(process.env.HUMAN_TOOL_ROUTER_TOP_K);
    return Number.isFinite(envVal) && envVal >= 1 ? Math.min(64, Math.trunc(envVal)) : 6;
  }

  private getThreshold(): number {
    if (typeof this.thresholdOverride === 'number') return this.thresholdOverride;
    const envVal = Number(process.env.HUMAN_TOOL_ROUTER_THRESHOLD);
    return Number.isFinite(envVal) && envVal >= 0 && envVal <= 1 ? envVal : 0.25;
  }

  private getMinCandidates(): number {
    if (typeof this.minCandidatesOverride === 'number') return this.minCandidatesOverride;
    const envVal = Number(process.env.HUMAN_TOOL_ROUTER_MIN_CANDIDATES);
    return Number.isFinite(envVal) && envVal >= 1 ? Math.trunc(envVal) : 3;
  }

  private getRouteTimeoutMs(): number {
    if (typeof this.routeTimeoutMsOverride === 'number') return this.routeTimeoutMsOverride;
    const envVal = Number(process.env.HUMAN_TOOL_ROUTER_TIMEOUT_MS);
    return Number.isFinite(envVal) && envVal >= 20 ? Math.trunc(envVal) : 4000;
  }

  /**
   * 为单次 Agent 运行准备工具集并执行基底节决策
   */
  async prepareToolsForRun(options: {
    userText?: string;
    contextSummary?: string;
    allTools: AgentTool[];
    mode?: ToolRouterMode;
    topK?: number;
    threshold?: number;
    routeTimeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<PreparedAgentToolsResult> {
    if (options.signal?.aborted) {
      throw new Error('Agent run cancelled');
    }
    const startMs = Date.now();
    const mode = options.mode ?? this.getMode();
    const topK = options.topK ?? this.getTopK();
    const threshold = options.threshold ?? this.getThreshold();

    // 过滤内部 router 插件自身能力（如 qwen3-jev-mlx.router.decide），不暴露给业务 Agent
    const businessTools = options.allTools.filter(
      (t) => !t.name.endsWith('.router.decide') && t.name !== TOOL_SEARCH_NAME,
    );
    const searchTracker: ToolSearchTracker = {
      searchedQueries: [],
      invokedHiddenTools: [],
      discoveredTools: [],
    };

    const userText = (options.userText ?? '').trim();

    // 短路条件：mode=off，或没有 userText（如 continue 模式），或候选工具数量不足
    if (
      mode === 'off' ||
      !userText ||
      businessTools.length < this.getMinCandidates()
    ) {
      const allIds = businessTools.map((t) => t.name);
      return {
        tools: businessTools,
        candidateCount: businessTools.length,
        searchTracker,
        decision: {
          mode,
          selectedToolIds: allIds,
          scores: allIds.map((id) => ({ toolId: id, probability: 1 })),
          matchedHistoryIds: [],
          routerSource: mode === 'off' ? 'off' : 'short-circuit',
          latencyMs: Date.now() - startMs,
        },
      };
    }

    const candidates: ToolCandidateMeta[] = businessTools.map((t) => ({
      toolId: t.name,
      category: t.name.includes('.') ? t.name.split('.')[0] : undefined,
      description: t.description || t.label || t.name,
    }));

    const decision = await this.decide({
      userText,
      contextSummary: options.contextSummary,
      candidates,
      mode,
      topK,
      threshold,
      routeTimeoutMs: options.routeTimeoutMs,
      signal: options.signal,
    });

    if (options.signal?.aborted) {
      throw new Error('Agent run cancelled');
    }

    if (mode === 'shadow') {
      // 影子模式：旁路记录决策，但仍向 Agent 注入全部业务工具
      return {
        tools: businessTools,
        candidateCount: businessTools.length,
        searchTracker,
        decision,
      };
    }

    // Active 模式：仅挂载选中的 Top-K 工具 + 1 个固定兜底元工具 tool_search
    const selectedSet = new Set(decision.selectedToolIds);
    const filteredTools = businessTools.filter((t) => selectedSet.has(t.name));
    const toolSearch = createToolSearchAgentTool(businessTools, searchTracker);

    return {
      tools: [...filteredTools, toolSearch],
      candidateCount: businessTools.length,
      searchTracker,
      decision,
    };
  }

  /**
   * 对候选工具集执行单次路由打分（可由 BrainAgentService 或总线直接调用）
   */
  async decide(options: {
    userText: string;
    contextSummary?: string;
    candidates: ToolCandidateMeta[];
    mode?: ToolRouterMode;
    topK?: number;
    threshold?: number;
    routeTimeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ToolRouteDecision> {
    if (options.signal?.aborted) {
      throw new Error('Agent run cancelled');
    }
    const startMs = Date.now();
    const mode = options.mode ?? this.getMode();
    const rawTopK = options.topK ?? this.getTopK();
    const topK = Math.min(64, Math.max(1, Math.trunc(rawTopK)));
    const rawThreshold = options.threshold ?? this.getThreshold();
    const threshold = Math.min(1, Math.max(0, rawThreshold));
    const routeTimeoutMs = options.routeTimeoutMs ?? this.getRouteTimeoutMs();

    // 1. 检索历史相似任务与错题本（第一层快进化：秒级纠偏）
    const similarExamples: FewShotRoutingExample[] = this.logStore
      ? this.logStore.findSimilarExamples(options.userText, 2)
      : [];
    const matchedHistoryIds = similarExamples.map((e) => e.id);

    // 2. 优先尝试调用已安装的 router@1.0 插件（如 qwen3-jev-mlx），受宿主级时间预算与取消信号约束
    const pluginDecision = await this.tryInvokeRouterPlugin({
      userText: options.userText,
      contextSummary: options.contextSummary,
      candidates: options.candidates,
      fewShotExamples: similarExamples.map((ex) => ({
        userText: ex.userText,
        actualTools: ex.actualTools,
      })),
      topK,
      threshold,
      routeTimeoutMs,
      signal: options.signal,
    });

    if (options.signal?.aborted) {
      throw new Error('Agent run cancelled');
    }

    if (pluginDecision) {
      // 叠加错题本高相似度记忆加权（若某工具在高度相似的历史错题中被证实必用，确保保底召回）
      const merged = this.applyFewShotBoost(
        pluginDecision.scores,
        similarExamples,
        topK,
        threshold,
      );
      return {
        mode,
        selectedToolIds: merged.selectedToolIds,
        scores: merged.scores,
        matchedHistoryIds,
        routerSource: pluginDecision.routerSource,
        latencyMs: Date.now() - startMs,
      };
    }

    // 3. 无外部插件时优雅降级：宿主内置零依赖词汇+错题本打分器（lexical-fallback）
    const fallback = this.lexicalFallbackRoute(
      options.userText,
      options.contextSummary,
      options.candidates,
      similarExamples,
      topK,
      threshold,
    );

    return {
      mode,
      selectedToolIds: fallback.selectedToolIds,
      scores: fallback.scores,
      matchedHistoryIds,
      routerSource: 'lexical-fallback',
      latencyMs: Date.now() - startMs,
    };
  }

  /**
   * 会后扫描主脑实际成功调用的工具，自动比对预测集并记入 SQLite 路由日志与错题本
   */
  recordRunOutcome(options: {
    sessionId: string;
    requestId: string;
    userText?: string;
    prepared?: PreparedAgentToolsResult;
    newMessages: unknown[];
  }): ToolRoutingLogEntry | undefined {
    if (!this.logStore || !options.prepared || !options.userText?.trim()) {
      return undefined;
    }
    const { decision, searchTracker, candidateCount } = options.prepared;
    if (decision.mode === 'off') {
      return undefined;
    }

    // 第一遍扫描：建立 assistant toolCallId -> toolName 映射（仅登记尝试调用，不直接算成功）
    const callIdToToolName = new Map<string, string>();
    for (const msg of options.newMessages) {
      const m = msg as Record<string, any>;
      if (!m || typeof m !== 'object') continue;
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        for (const block of m.content) {
          if (
            block &&
            block.type === 'toolCall' &&
            typeof block.name === 'string' &&
            typeof block.id === 'string' &&
            block.id
          ) {
            callIdToToolName.set(block.id, block.name);
          }
        }
      }
    }

    // 第二遍扫描：仅将具有成功 toolResult（非错误）的工具记入实际成功调用集合 A
    const actualToolSet = new Set<string>();
    for (const msg of options.newMessages) {
      const m = msg as Record<string, any>;
      if (!m || typeof m !== 'object' || m.role !== 'toolResult') continue;
      if (isToolExecutionError(m)) continue;

      const resolvedName =
        typeof m.toolName === 'string' && m.toolName
          ? m.toolName
          : typeof m.toolCallId === 'string'
            ? callIdToToolName.get(m.toolCallId)
            : undefined;
      if (resolvedName && resolvedName !== TOOL_SEARCH_NAME) {
        actualToolSet.add(resolvedName);
      }
    }

    // 把通过 tool_search 直接代理且执行成功的隐藏工具并入主脑实际成功调用集 A
    for (const hiddenTool of searchTracker.invokedHiddenTools) {
      actualToolSet.add(hiddenTool);
    }

    const actualTools = Array.from(actualToolSet);
    const predictedSet = new Set(decision.selectedToolIds);

    // 漏选错题（False Negative）：仅当主脑实际使用了未在预测集 R 中的工具（A \ R ≠ ∅）才记为错题；
    // 若通过 tool_search 代理调用的是原本已在 predictedSet 中的工具，绝不污染错题本
    const falseNegatives = actualTools.filter((t) => !predictedSet.has(t));
    const isFalseNegative = falseNegatives.length > 0;

    try {
      return this.logStore.recordLog({
        sessionId: options.sessionId,
        requestId: options.requestId,
        mode: decision.mode,
        userText: options.userText.trim(),
        candidateCount,
        predictedTools: decision.selectedToolIds,
        scores: decision.scores,
        actualTools,
        searchedQueries: searchTracker.searchedQueries,
        falseNegatives,
        isFalseNegative,
        routerSource: decision.routerSource,
        latencyMs: decision.latencyMs,
      });
    } catch (error) {
      this.logger.warn(`记录工具路由日志失败: ${String(error)}`);
      return undefined;
    }
  }

  getStatusAndLogs(options?: { limit?: number; onlyFalseNegatives?: boolean; sessionId?: string }) {
    return {
      config: this.getConfig(),
      stats: this.logStore?.getStats() ?? { totalRuns: 0, falseNegativeCount: 0, avgLatencyMs: 0 },
      logs: this.logStore?.listLogs(options) ?? [],
    };
  }

  private async tryInvokeRouterPlugin(params: {
    userText: string;
    contextSummary?: string;
    candidates: ToolCandidateMeta[];
    fewShotExamples: Array<{ userText: string; actualTools: string[] }>;
    topK: number;
    threshold: number;
    routeTimeoutMs: number;
    signal?: AbortSignal;
  }): Promise<{
    selectedToolIds: string[];
    scores: ToolRoutingScoreItem[];
    routerSource: string;
  } | null> {
    if (!this.motor) return null;
    if (params.signal?.aborted) {
      throw new Error('Agent run cancelled');
    }

    const invoke = (topic: string, payload: Record<string, unknown>) =>
      this.motor!.handleCommand({
        id: crypto.randomUUID(),
        kind: topic.endsWith('.list') ? 'query' : 'command',
        topic,
        source: {
          actorId: 'brain-main',
          runtime: 'nest',
          system: 'brain',
          module: 'basal-ganglia',
        },
        timestamp: Date.now(),
        payload,
      });

    const pluginAbort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onParentAbort = () => pluginAbort.abort(new Error('Agent run cancelled'));

    try {
      const discovery: any = await invoke('motor.tool.list', {
        category: 'router',
        detailed: true,
      });
      if (params.signal?.aborted) {
        throw new Error('Agent run cancelled');
      }
      const routerTool =
        discovery?.success &&
        discovery.data?.tools?.find(
          (t: any) =>
            ['ready', 'running'].includes(t.status) &&
            t.capabilities?.includes('router.decide'),
        );
      if (!routerTool) return null;

      params.signal?.addEventListener('abort', onParentAbort, { once: true });

      const abortPromise = new Promise<never>((_, reject) => {
        if (params.signal?.aborted) {
          pluginAbort.abort();
          reject(new Error('Agent run cancelled'));
          return;
        }
        pluginAbort.signal.addEventListener(
          'abort',
          () => {
            if (params.signal?.aborted) {
              reject(new Error('Agent run cancelled'));
            } else {
              reject(new Error(`Router plugin timed out after ${params.routeTimeoutMs}ms`));
            }
          },
          { once: true },
        );
      });

      timer = setTimeout(() => {
        pluginAbort.abort(new Error('ROUTER_TIMEOUT'));
      }, params.routeTimeoutMs);

      const execRes: any = await Promise.race([
        invoke('motor.tool.execute', {
          tool: routerTool.id,
          capability: 'router.decide',
          signal: pluginAbort.signal,
          parameters: {
            userText: params.userText,
            contextSummary: params.contextSummary,
            candidates: params.candidates,
            fewShotExamples: params.fewShotExamples,
            topK: params.topK,
            threshold: params.threshold,
          },
        }),
        abortPromise,
      ]);

      if (!execRes?.success || !execRes.data?.success) {
        this.logger.warn(
          `外部路由插件 ${routerTool.id} 调用失败，自动回退内置路由: ${
            execRes?.data?.error?.message || execRes?.msg || 'unknown error'
          }`,
        );
        return null;
      }

      const payload = execRes.data.data;
      if (!payload || !Array.isArray(payload.selectedToolIds) || !Array.isArray(payload.scores)) {
        return null;
      }

      return {
        selectedToolIds: payload.selectedToolIds,
        scores: payload.scores,
        routerSource: payload.model ? `${routerTool.id}:${payload.model}` : routerTool.id,
      };
    } catch (error) {
      if (params.signal?.aborted || (error instanceof Error && error.message === 'Agent run cancelled')) {
        throw new Error('Agent run cancelled');
      }
      this.logger.warn(`调用外部路由插件超时或异常，回退内置路由: ${String(error)}`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      params.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  private applyFewShotBoost(
    rawScores: ToolRoutingScoreItem[],
    similarExamples: FewShotRoutingExample[],
    topK: number,
    threshold: number,
  ): { selectedToolIds: string[]; scores: ToolRoutingScoreItem[] } {
    if (similarExamples.length === 0) {
      const sorted = [...rawScores].sort((a, b) => b.probability - a.probability);
      const selected = sorted
        .filter((s) => s.probability >= threshold)
        .slice(0, topK)
        .map((s) => s.toolId);
      return {
        selectedToolIds: selected.length > 0 ? selected : sorted.slice(0, Math.min(2, topK)).map((s) => s.toolId),
        scores: sorted,
      };
    }

    const boostMap = new Map<string, number>();
    for (const ex of similarExamples) {
      // 当历史记录相似度较高时，为该历史任务实际用到的工具（尤其是曾漏选的工具）提供先验增益
      const weight = Math.min(0.45, ex.similarity * (ex.isFalseNegative ? 0.55 : 0.35));
      for (const toolId of ex.actualTools) {
        boostMap.set(toolId, Math.max(boostMap.get(toolId) ?? 0, weight));
      }
    }

    const adjusted = rawScores.map((item) => {
      const boost = boostMap.get(item.toolId) ?? 0;
      const prob = Math.min(0.999, Number((item.probability + (1 - item.probability) * boost).toFixed(4)));
      return { ...item, probability: prob };
    });

    adjusted.sort((a, b) => b.probability - a.probability);
    const selected = adjusted
      .filter((s) => s.probability >= threshold)
      .slice(0, topK)
      .map((s) => s.toolId);

    return {
      selectedToolIds:
        selected.length > 0
          ? selected
          : adjusted.slice(0, Math.min(2, topK)).map((s) => s.toolId),
      scores: adjusted,
    };
  }

  /**
   * 宿主零依赖内置回退路由器（当未安装本地 Qwen3-1.7B 插件时保障 100% 可用）
   */
  private lexicalFallbackRoute(
    userText: string,
    contextSummary: string | undefined,
    candidates: ToolCandidateMeta[],
    similarExamples: FewShotRoutingExample[],
    topK: number,
    threshold: number,
  ): { selectedToolIds: string[]; scores: ToolRoutingScoreItem[] } {
    const combinedText = contextSummary?.trim()
      ? `${userText}\n${contextSummary}`
      : userText;
    const qLower = combinedText.toLowerCase();
    const ctxLower = (contextSummary ?? '').toLowerCase();
    const cjkBigrams = new Set<string>();
    const cjk = qLower.match(/[\u4e00-\u9fa5]/g) ?? [];
    for (let i = 0; i < cjk.length; i++) {
      cjkBigrams.add(cjk[i]);
      if (i + 1 < cjk.length) cjkBigrams.add(cjk[i] + cjk[i + 1]);
    }
    const enWords = new Set<string>(qLower.match(/[a-z0-9_.-]{2,}/g) ?? []);

    const rawScores: ToolRoutingScoreItem[] = candidates.map((cand) => {
      const hay = `${cand.toolId} ${cand.category ?? ''} ${cand.description}`.toLowerCase();
      let hits = 0;

      for (const w of enWords) {
        if (hay.includes(w)) hits += 2.0;
      }
      for (const bg of cjkBigrams) {
        if (bg.length === 2 && hay.includes(bg)) hits += 1.8;
        else if (bg.length === 1 && hay.includes(bg)) hits += 0.35;
      }
      if (ctxLower && ctxLower.includes(cand.toolId.toLowerCase())) {
        hits += 2.2;
      }

      // Logit 映射到 [0.05, 0.95]
      const logit = hits - 1.2;
      const prob = Number((1 / (1 + Math.exp(-logit))).toFixed(4));
      return {
        toolId: cand.toolId,
        category: cand.category,
        probability: prob,
      };
    });

    return this.applyFewShotBoost(rawScores, similarExamples, topK, threshold);
  }
}
