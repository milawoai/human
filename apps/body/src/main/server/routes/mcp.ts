/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-09
 * @Description: MCP JSON-RPC 2.0 路由
 */
import express, { Router } from 'express'
import { getMcpToolsList, invokeElFunc } from '@main/services/mcp/index'

interface JsonRpcRequest {
  jsonrpc?: string
  id?: number | string
  method: string
  params?: any
}

function jsonRpcResult(jsonrpc: string, id: number | string, result: any) {
  return { jsonrpc, id, result }
}

function jsonRpcError(jsonrpc: string, id: number | string, code: number, message: string) {
  return { jsonrpc, id, error: { code, message } }
}

export function setupMcpRoutes(app: express.Application): void {
  const router = Router()

  // GET /mcp/rpc -- 端点存活探测
  router.get('/rpc', (_req, res) => {
    res.json({
      protocol: 'mcp',
      version: '1.0',
      status: 'ready',
      transport: 'http',
      message: 'Electron MCP Server is running.'
    })
  })

  // POST /mcp/rpc -- JSON-RPC 2.0 入口
  router.post('/rpc', async (req, res) => {
    const body: JsonRpcRequest = req.body
    const jsonrpc = body.jsonrpc || '2.0'
    const id = body.id || 0

    try {
      switch (body.method) {
        case 'initialize':
          res.json(
            jsonRpcResult(jsonrpc, id, {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'electron-mcp-server', version: '1.0.0' }
            })
          )
          break

        case 'tools/list':
          res.json(jsonRpcResult(jsonrpc, id, { tools: getMcpToolsList() }))
          break

        case 'tools/call': {
          const { name, arguments: args } = body.params
          const [serverName, funcName] = name.split('__')
          const jsondata = JSON.stringify({
            serverName,
            funcName,
            paramsJsonString: JSON.stringify(args)
          })
          const result = await invokeElFunc(jsondata)
          res.json(
            jsonRpcResult(jsonrpc, id, {
              content: [{ type: 'text', text: JSON.stringify(result) }]
            })
          )
          break
        }

        default:
          res.json(jsonRpcError(jsonrpc, id, -32601, `不支持的方法: ${body.method}`))
      }
    } catch (error: any) {
      res.json(jsonRpcError(jsonrpc, id, -32603, error?.message || '内部错误'))
    }
  })

  app.use('/mcp', router)
}
