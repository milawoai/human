import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

export const TOOL_SEARCH_NAME = 'tool_search';

export interface ToolSearchTracker {
  searchedQueries: string[];
  invokedHiddenTools: string[];
  discoveredTools: string[];
}

/**
 * 统一判定 AgentToolResult 或持久化的 toolResult 消息是否为失败结果
 * 同时覆盖：
 * - pi-agent-core 标准 `isError: true`（含 Motor `AgentToolAdapter` 失败/拦截时设置的 `isError: true`）
 * - 显式布尔失败标记 `ok: false` / `success: false` / `details.isError: true` / `details.blocked: true`
 * 注意：绝不将业务成功数据中的 `{ code: "OK", message: "..." }` 或普通 `error` 字段误判为失败。
 */
export function isToolExecutionError(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, any>;
  if (r.isError === true) return true;
  if (r.isError === undefined && r.terminate === true) return true;
  if (r.ok === false || r.success === false) return true;
  const details =
    typeof r.details === 'object' && r.details !== null
      ? (r.details as Record<string, any>)
      : undefined;
  if (!details) return false;
  if (
    details.isError === true ||
    details.ok === false ||
    details.success === false ||
    details.blocked === true
  ) {
    return true;
  }
  return false;
}

/**
 * 构造基底节（Basal Ganglia）兜底元工具 `tool_search`
 *
 * 作用：
 * 1. 当 Active 模式下本地小模型偶发漏选（False Negative）时，主脑大模型可通过
 *    `tool_search({ query })` 检索全量候选工具池的名称、描述与参数说明；
 * 2. 支持在同一次调用中通过 `callTool` + `callArgs` 直接代理执行漏选的工具，
 *    无需等待下一轮会话重新挂载工具表；
 * 3. 一旦触发检索或代理调用，自动记录到 tracker 中，会后写入 SQLite 错题本
 *    （`is_false_negative = 1`），下一轮同类任务通过动态 Few-shot 立即纠偏。
 */
export function createToolSearchAgentTool(
  allCandidateTools: AgentTool[],
  tracker: ToolSearchTracker,
): AgentTool {
  const toolMap = new Map<string, AgentTool>();
  for (const t of allCandidateTools) {
    toolMap.set(t.name, t);
  }

  const parameters = Type.Object({
    query: Type.Optional(
      Type.String({
        description: '搜索漏选工具的关键词（匹配工具名称或功能描述）',
      }),
    ),
    callTool: Type.Optional(
      Type.String({
        description: '若已知或搜到目标工具名（如 pi-coding-tools.read），可直接填入以立即执行该工具',
      }),
    ),
    callArgs: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: '当指定 callTool 时，传递给目标工具的参数对象',
      }),
    ),
  });

  return {
    name: TOOL_SEARCH_NAME,
    label: 'BasalGanglia/tool_search',
    description:
      '当当前已挂载工具不足以完成任务时，按关键词搜索系统中全部可用工具，或通过 callTool + callArgs 直接调用未挂载的工具。',
    parameters,
    prepareArguments: (args: unknown) => {
      if (typeof args === 'object' && args !== null) {
        return args as Record<string, unknown>;
      }
      return {};
    },
    execute: async (toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> => {
      const raw = (params ?? {}) as {
        query?: string;
        callTool?: string;
        callArgs?: Record<string, unknown>;
      };

      const query = typeof raw.query === 'string' ? raw.query.trim() : '';
      const callToolName = typeof raw.callTool === 'string' ? raw.callTool.trim() : '';

      if (query) {
        tracker.searchedQueries.push(query);
      }

      // 1. 如果指定了直接代理执行的目标工具
      if (callToolName) {
        const target = toolMap.get(callToolName);
        if (!target) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: `未找到名为 "${callToolName}" 的工具`,
                  availableTools: Array.from(toolMap.keys()),
                }),
              },
            ],
            details: { ok: false, callTool: callToolName },
          };
        }

        const prepared = target.prepareArguments
          ? target.prepareArguments(raw.callArgs ?? {})
          : (raw.callArgs ?? {});
        const result = await target.execute(toolCallId, prepared, signal, onUpdate);
        if (!isToolExecutionError(result) && !tracker.invokedHiddenTools.includes(callToolName)) {
          tracker.invokedHiddenTools.push(callToolName);
        }
        return result;
      }

      // 2. 按关键词检索匹配的全量候选工具
      const qLower = query.toLowerCase();
      const keywords = qLower
        .split(/[\s,，、;；]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const matched = allCandidateTools
        .map((tool) => {
          const hay = `${tool.name} ${tool.label ?? ''} ${tool.description ?? ''}`.toLowerCase();
          let score = 0;
          if (!qLower) {
            score = 1;
          } else {
            if (hay.includes(qLower)) score += 3;
            for (const kw of keywords) {
              if (hay.includes(kw)) score += 1;
            }
          }
          return { tool, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ tool }) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        }));

      for (const m of matched) {
        if (!tracker.discoveredTools.includes(m.name)) {
          tracker.discoveredTools.push(m.name);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              query,
              matchedCount: matched.length,
              tools: matched,
              hint: '如需调用上述任意工具，可再次调用 tool_search 并传入 callTool="<工具名>" 与 callArgs={...}',
            }),
          },
        ],
        details: {
          ok: true,
          query,
          matchedTools: matched.map((m) => m.name),
        },
      };
    },
    executionMode: 'parallel',
  };
}
