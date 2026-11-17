/**
 * 模型配置服务（主进程）
 *
 * 可视化模型配置（human-48b）：渲染层经 IPC 调用这里，
 * 这里统一经 Neural HTTP 触发 backend 的 brain.language.* topic。
 * 密钥不出 backend——本服务不接触任何 key。
 */
import { neuralTrigger } from '../neural/impl/neural-http'

const trigger = (kind: string, topic: string, payload?: unknown) =>
  neuralTrigger({ kind, topic, payload })

export const list = async () => trigger('query', 'brain.language.models.list', {})

export const switchModel = async (params: { profile: string; model?: string }) =>
  trigger('command', 'brain.language.model.switch', params)

export const remoteModels = async (params: { profile: string }) =>
  trigger('query', 'brain.language.providers.remote_models', params)

export const probe = async (params: { baseUrl: string }) =>
  trigger('command', 'brain.language.providers.probe', params)

export const validateAll = async () =>
  trigger('query', 'brain.language.models.validate', { strictEnv: false })
