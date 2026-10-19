/**
 * 类别契约 — 契约注册表
 *
 * 宿主通过注册表按 category + contractVersion 定位契约并校验插件声明，
 * 注册表本身类别无关（tts / 未来 asr / stt / ... 一视同仁）。
 */
import type {
  ToolContract,
  ContractCheckTarget,
  ContractValidationResult,
} from './types';

export class ContractRegistry {
  /** key: `${category}@${version}` */
  private readonly contracts = new Map<string, ToolContract>();

  register(contract: ToolContract): void {
    if (!contract.category || !contract.version) {
      throw new Error('契约必须声明 category 与 version');
    }
    this.contracts.set(this.key(contract.category, contract.version), contract);
  }

  has(category: string, version: string): boolean {
    return this.contracts.has(this.key(category, version));
  }

  get(category: string, version: string): ToolContract | undefined {
    return this.contracts.get(this.key(category, version));
  }

  /** 类别下已注册的所有版本 */
  versions(category: string): string[] {
    return Array.from(this.contracts.keys())
      .filter((k) => k.startsWith(`${category}@`))
      .map((k) => k.split('@')[1]);
  }

  list(): ToolContract[] {
    return Array.from(this.contracts.values());
  }

  /**
   * 校验工具声明是否满足其声明的类别契约（加载时调用）。
   *
   * - 未声明 category 的工具直接通过（契约仅对声明类别的工具生效）
   * - 声明了 category 则必须同时声明 contractVersion，且版本已注册
   * - 必选能力（required: true）必须全部出现在工具 capabilities 中
   */
  validateTool(target: ContractCheckTarget): ContractValidationResult {
    if (!target.category) {
      return { ok: true, errors: [] };
    }

    if (!target.contractVersion) {
      return {
        ok: false,
        errors: [`工具 ${target.id} 声明了 category=${target.category} 但未声明 contractVersion`],
      };
    }

    const contract = this.get(target.category, target.contractVersion);
    if (!contract) {
      const known = this.versions(target.category);
      return {
        ok: false,
        errors: [
          `工具 ${target.id} 声明契约 ${target.category}@${target.contractVersion} 未注册` +
            (known.length ? `（已知版本: ${known.join(', ')}）` : '（该类别无已注册契约）'),
        ],
      };
    }

    const declared = new Set(target.capabilities.map((c) => c.name));
    const errors: string[] = [];

    for (const cap of contract.capabilities) {
      if (cap.required && !declared.has(cap.name)) {
        errors.push(`缺少必选能力 ${cap.name}（契约 ${contract.category}@${contract.version}）`);
      }
    }

    return { ok: errors.length === 0, errors, contract: errors.length === 0 ? contract : undefined };
  }

  private key(category: string, version: string): string {
    return `${category}@${version}`;
  }
}
