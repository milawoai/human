/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-09
 * @Description: MCP 核心逻辑 - 工具注册与函数调用分发
 */
import mcpFunctions from '../../mcp-functions.json'
import * as commonService from '../common/index'

// ==================== 新增服务时在此处 import ====================
// import * as projectService from '../project/index'

interface McpFunction {
  serverName: string
  funcName: string
  description: string
  params: Array<{
    name: string
    type: string
    description: string
    required: boolean
  }>
}

const serviceMap: Record<string, Record<string, unknown>> = {
  common: commonService
  // ==================== 新增服务时在此处注册 ====================
  // project: projectService,
}

// JSON Schema Draft 2020-12 合法的基本类型
const VALID_JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null'
])

/**
 * 将 mcp-functions.json 中的类型转换为合法的 JSON Schema 属性描述
 * - 合法类型直接透传
 * - 非标准类型（any / jsonValue 等）转为无 type 约束（任意值）
 */
function toSchemaProperty(p: McpFunction['params'][number]): Record<string, unknown> {
  if (VALID_JSON_SCHEMA_TYPES.has(p.type)) {
    return { type: p.type, description: p.description }
  }
  // 任意 JSON 可序列化值：不限制类型，仅保留描述
  return { description: p.description }
}

/**
 * 获取 MCP 工具列表
 */
export function getMcpToolsList() {
  return mcpFunctions.map((item: McpFunction) => ({
    name: `${item.serverName}__${item.funcName}`,
    description: item.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(item.params.map((p) => [p.name, toSchemaProperty(p)])),
      required: item.params.filter((p) => p.required).map((p) => p.name)
    }
  }))
}

/**
 * 执行函数调用
 * @param jsondata 包含 serverName, funcName, paramsJsonString 的 JSON 字符串
 */
export function invokeElFunc(jsondata: string): unknown {
  const { serverName, funcName, paramsJsonString } = JSON.parse(jsondata)
  const params = JSON.parse(paramsJsonString)

  // 安全校验：只允许调用 mcp-functions.json 中声明的函数
  const funcDef = (mcpFunctions as McpFunction[]).find(
    (item) => item.serverName === serverName && item.funcName === funcName
  )
  if (!funcDef) {
    throw new Error(`函数 ${serverName}.${funcName} 未在 MCP 白名单中`)
  }

  const service = serviceMap[serverName]
  if (!service) {
    throw new Error(`未实现的服务: ${serverName}`)
  }

  const fn = service[funcName]
  if (typeof fn !== 'function') {
    throw new Error(`${serverName} 服务中不存在函数: ${funcName}`)
  }

  const args = funcDef.params.map((p) => params[p.name])
  return fn(...args)
}
