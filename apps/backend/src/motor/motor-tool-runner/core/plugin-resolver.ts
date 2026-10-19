/**
 * Motor Tool Runner — 插件解析器
 *
 * 解决「工程外安装的插件包如何被宿主加载」：
 * 裸 import(specifier) 只按宿主自身模块路径解析（backend node_modules），
 * 装在任意外部目录的包找不到。本解析器显式解析出包入口文件的绝对路径，
 * 再以 file:// URL 动态 import，不受调用方模块解析限制。
 *
 * 解析顺序：
 *   ① 宿主 node_modules（require.resolve，兼容 bundled 插件如 @human/cmux-tools）
 *   ② 插件安装根目录（默认 ~/.ai_secretary/plugins/node_modules，installed 插件）
 *      → 读 package.json 的 exports["."] / module / main 确定入口
 *      → 兜底 dist/index.js / index.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pathToFileURL } from 'url';

/** 默认插件安装根目录（installed 插件经 `npm install` 落位于此） */
export function defaultPluginRoots(): string[] {
  return [path.join(os.homedir(), '.ai_secretary', 'plugins', 'node_modules')];
}

export class PluginResolver {
  constructor(private readonly roots: string[] = defaultPluginRoots()) {}

  /**
   * 解析包入口文件的绝对路径。
   * 找不到返回 null（不抛异常，调用方决定如何记录）。
   */
  resolveEntry(specifier: string): string | null {
    // ① 宿主 node_modules（CJS require.resolve，覆盖 backend 依赖与根 workspace 提升）
    try {
      const resolved = require.resolve(specifier);
      if (resolved) return resolved;
    } catch {
      /* 不在宿主依赖中，继续找插件根目录 */
    }

    // ② 插件安装根目录
    for (const root of this.roots) {
      const entry = this.resolveFromRoot(root, specifier);
      if (entry) return entry;
    }
    return null;
  }

  /**
   * 解析包内相对路径文件（如 `${module}/config/<id>.json`）。
   * 供 motor.tool.install 的配置同步使用，同样支持外部目录。
   */
  resolvePackageFile(specifier: string, relativePath: string): string | null {
    try {
      const resolved = require.resolve(`${specifier}/${relativePath}`);
      if (resolved) return resolved;
    } catch {
      /* fallthrough 到插件根目录 */
    }
    for (const root of this.roots) {
      const candidate = path.join(root, ...specifier.split('/'), ...relativePath.split('/'));
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * 动态导入插件包，返回其模块命名空间（不做展开）。
   *
   * - 以入口绝对路径的 file:// URL 导入，绕开调用方模块解析限制
   * - new Function 包裹防止打包器静态分析（沿用 pi-coding-provider 先例）
   * - 保留 namespace 原样返回：CJS 包经 import 后 module.exports 挂在
   *   namespace.default（Node 亦会尽可能补出具名导出），ESM 包保持原生形态。
   *   两种形态的语义差异由调用方（loadProviderFromModule）统一消化
   *
   * @returns 模块命名空间对象。约定：
   *   - ESM 包：具名导出 + default 均可直接读取
   *   - CJS 包：module.exports 位于 default（工厂对象、provider 实例均如此）
   */
  async importModule(specifier: string): Promise<Record<string, unknown>> {
    const entry = this.resolveEntry(specifier);
    if (!entry) {
      throw new Error(
        `插件包 ${specifier} 未找到（查找范围：宿主 node_modules + ${this.roots.join(', ')}）`,
      );
    }
    const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
    return (await dynamicImport(pathToFileURL(entry).href)) as Record<string, unknown>;
  }

  /** 从单个插件根目录解析包入口 */
  private resolveFromRoot(root: string, specifier: string): string | null {
    const pkgDir = path.join(root, ...specifier.split('/'));
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      return null;
    }

    const entryRelative = this.pickEntry(pkg);
    if (!entryRelative) return null;

    const entry = path.resolve(pkgDir, entryRelative);
    return fs.existsSync(entry) ? entry : null;
  }

  /**
   * package.json → 入口：exports > module > main > dist/index.js。
   *
   * exports 支持两种合法形态（按 Node 解析规则近似）：
   * - 点位条件：{ ".": "./index.js" } / { ".": { "import": "./e.mjs", "require": "./c.js" } }
   * - 顶层条件：{ "import": "./e.mjs", "require": "./c.js" }（无 "." 键时整个 exports 即条件表）
   * 条件取值顺序：import > node > default > require（宿主经动态 import 加载，import 优先）。
   */
  private pickEntry(pkg: Record<string, unknown>): string | null {
    const exp = pkg.exports;
    if (typeof exp === 'string') return exp;
    if (exp && typeof exp === 'object') {
      const exportsObj = exp as Record<string, unknown>;
      const dot = exportsObj['.'];
      if (typeof dot === 'string') return dot;
      // 点位条件 或 顶层条件（无 "." 键）
      const picked = dot !== undefined ? this.pickCondition(dot) : this.pickCondition(exportsObj);
      if (typeof picked === 'string') return picked;
    }
    const module_ = pkg.module;
    if (typeof module_ === 'string') return module_;
    const main = pkg.main;
    if (typeof main === 'string') return main;
    return 'dist/index.js';
  }

  /** 条件表 → 入口字符串；支持一层嵌套（如 node 条件内再含 import/default） */
  private pickCondition(cond: unknown): string | null {
    if (typeof cond === 'string') return cond;
    if (!cond || typeof cond !== 'object') return null;
    const obj = cond as Record<string, unknown>;
    for (const key of ['import', 'node', 'default', 'require']) {
      const value = obj[key];
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        const nested = this.pickCondition(value);
        if (nested) return nested;
      }
    }
    return null;
  }
}

/** 默认解析器单例（根目录 = 默认插件安装根目录） */
export const defaultPluginResolver = new PluginResolver();
