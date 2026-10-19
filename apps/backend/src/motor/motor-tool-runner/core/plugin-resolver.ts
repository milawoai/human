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
   * 动态导入插件包，返回其导出对象。
   *
   * - 以入口绝对路径的 file:// URL 导入，绕开调用方模块解析限制
   * - new Function 包裹防止打包器静态分析（沿用 pi-coding-provider 先例）
   * - CJS 包被 import 后整体挂在 namespace.default，做一层展开
   *   使「工厂对象 { create() }」「直接 provider 实例」两种形态都能被取出
   */
  async importModule(specifier: string): Promise<Record<string, unknown>> {
    const entry = this.resolveEntry(specifier);
    if (!entry) {
      throw new Error(
        `插件包 ${specifier} 未找到（查找范围：宿主 node_modules + ${this.roots.join(', ')}）`,
      );
    }
    const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
    const mod = (await dynamicImport(pathToFileURL(entry).href)) as Record<string, unknown>;

    // CJS 互操作：namespace 仅含 default 且为对象时展开
    if (
      mod.default &&
      typeof mod.default === 'object' &&
      Object.keys(mod).every((k) => k === 'default' || k.startsWith('_'))
    ) {
      return mod.default as Record<string, unknown>;
    }
    return mod;
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

  /** package.json → 入口：exports["."] > module > main > dist/index.js */
  private pickEntry(pkg: Record<string, unknown>): string | null {
    const exp = pkg.exports;
    if (typeof exp === 'string') return exp;
    if (exp && typeof exp === 'object') {
      const dot = (exp as Record<string, unknown>)['.'];
      if (typeof dot === 'string') return dot;
      if (dot && typeof dot === 'object') {
        const cond = (dot as Record<string, unknown>);
        const picked = cond.import ?? cond.default ?? cond.require;
        if (typeof picked === 'string') return picked;
      }
    }
    const module_ = pkg.module;
    if (typeof module_ === 'string') return module_;
    const main = pkg.main;
    if (typeof main === 'string') return main;
    return 'dist/index.js';
  }
}

/** 默认解析器单例（根目录 = 默认插件安装根目录） */
export const defaultPluginResolver = new PluginResolver();
