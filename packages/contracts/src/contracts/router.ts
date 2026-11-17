/**
 * router 类别契约 v1
 *
 * 工具决策路由类别契约：
 * - 输入用户任务文本（userText）、候选工具列表（candidates）及可选历史经验/错题（fewShotExamples）
 * - 输出选中的工具标识列表（selectedToolIds）及各候选工具相关性概率（scores）
 * - 宿主（Brain Basal Ganglia）仅依赖本契约，不耦合底层模型（Qwen3-1.7B MLX / 向量 / 其他小模型）
 */
import type { ToolContract } from '../types';

export const ROUTER_CONTRACT_V1: ToolContract = {
  category: 'router',
  version: '1.0',
  description: '工具决策路由类别契约 v1 —— 给定用户指令与候选工具，毫秒级输出概率打分与选中工具集',
  capabilities: [
    {
      name: 'router.decide',
      description: '对候选工具进行单步相关性打分并筛选当前任务所需工具',
      required: true,
      mode: 'sync',
      parameters: {
        userText: {
          type: 'string',
          required: true,
          minLength: 1,
          description: '用户当前任务输入文本',
        },
        contextSummary: {
          type: 'string',
          description: '可选会话上下文摘要',
        },
        candidates: {
          type: 'array',
          required: true,
          description: '候选工具列表（每项含 toolId、description 及可选 category）',
          items: {
            type: 'object',
            fields: {
              toolId: {
                type: 'string',
                required: true,
                minLength: 1,
                description: '候选工具唯一标识（如 pi-coding-tools.read）',
              },
              description: {
                type: 'string',
                required: true,
                minLength: 1,
                description: '候选工具能力描述',
              },
              category: {
                type: 'string',
                description: '可选工具所属类别',
              },
            },
          },
        },
        fewShotExamples: {
          type: 'array',
          description: '可选历史路由经验或错题本示例',
          items: {
            type: 'object',
            fields: {
              userText: {
                type: 'string',
                required: true,
                minLength: 1,
                description: '历史用户指令',
              },
              actualTools: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: '该指令实际需要调用的工具列表',
              },
            },
          },
        },
        topK: {
          type: 'number',
          minimum: 1,
          maximum: 64,
          description: '最多选出的工具数量（默认 6）',
        },
        threshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: '选中概率阈值（默认 0.25）',
        },
      },
      returns: {
        selectedToolIds: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description: '选中的工具 ID 列表',
        },
        scores: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            fields: {
              toolId: {
                type: 'string',
                required: true,
                minLength: 1,
                description: '候选工具唯一标识',
              },
              probability: {
                type: 'number',
                required: true,
                minimum: 0,
                maximum: 1,
                description: '校准后的选中概率 [0, 1]',
              },
            },
          },
          description: '各候选工具打分明细（按概率降序）',
        },
        latencyMs: {
          type: 'number',
          description: '模型推理耗时（毫秒）',
        },
        model: {
          type: 'string',
          description: '执行本次决策的模型或策略标识',
        },
      },
    },
  ],
};
