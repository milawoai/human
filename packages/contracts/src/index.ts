/**
 * @human/contracts — 工具插件类别契约
 *
 * 宿主（Motor）与插件仓库共用的契约层：
 * - 宿主：加载时校验 manifest 声明、调用时校验出入参
 * - 插件：devDependency 引用获取类型，用同一校验器在测试/CI 中自测
 */
export * from './types';
export * from './validate';
export * from './registry';
export { TTS_CONTRACT_V1 } from './contracts/tts';

import { ContractRegistry } from './registry';
import { TTS_CONTRACT_V1 } from './contracts/tts';

/**
 * 预置全部内置契约的注册表。
 * 宿主启动时使用；插件测试可 `new ContractRegistry()` 只装自己关心的契约。
 */
export function createDefaultRegistry(): ContractRegistry {
  const registry = new ContractRegistry();
  registry.register(TTS_CONTRACT_V1);
  return registry;
}

let defaultRegistry: ContractRegistry | undefined;

/**
 * 进程级默认注册表单例。
 * 宿主内多处（加载时校验、执行时校验）必须引用同一实例，
 * 以保证「加载时通过的契约」与「执行时强制的基线」一致。
 */
export function getDefaultRegistry(): ContractRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultRegistry();
  }
  return defaultRegistry;
}
