/**
 * @human/cmux-tools — 包入口
 *
 * motor-tool-runner 通过工具配置里的 providerModule/providerExport
 * dynamicImport 本包，取 cmuxProvider 工厂，调用 create() 得到 provider 实例。
 *
 * 导出契约：
 * - cmuxProvider: { create(): BuiltinToolProvider }  ← motor 加载这个
 * - CmuxProvider: 类（备用，直接 new 也可）
 * - CMUX_DEFAULT_CONFIG: 默认工具配置对象（供 createSampleTools 落盘）
 */
export { CmuxProvider } from './provider';
export { CmuxClient } from './client';
export type {
  BuiltinToolProvider,
  ToolInstance,
  ToolDescriptor,
  ToolResult,
  ToolContext,
  ToolCapability,
  ToolStatus,
  CmuxHealthState,
  CmuxClientConfig,
  CmuxCallResult,
  TransportHint,
} from './types';
export { CmuxErrorCodes, METHOD_MAP, DEFAULT_BINARY_PATH, DEFAULT_CONFIG } from './types';
export { CMUX_DEFAULT_CONFIG } from './default-config';

import { CmuxProvider } from './provider';

/**
 * 工厂导出 —— motor 通过 providerExport:"cmuxProvider" 加载。
 *
 * 用工厂而非直接导出实例：每次 create() 返回新 provider，
 * 避免多工具实例共享状态；也便于 motor 控制 provider 生命周期。
 */
export const cmuxProvider = {
  create: () => new CmuxProvider(),
};

export default cmuxProvider;
