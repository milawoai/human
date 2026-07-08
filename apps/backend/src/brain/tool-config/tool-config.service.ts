/**
 * ToolConfigService — 工具配置服务
 *
 * 负责从 ~/.ai_secretary/tools/ 目录读取工具配置
 * 配置在每次获取时重新加载（无缓存）
 */
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ToolConfig,
  ToolIndex,
  ToolIndexItem,
  ToolCapabilityConfig,
  ToolInterfaceConfig,
  DEFAULT_TOOLS_DIR,
} from './tool-config.types';
import type {
  ToolInstance,
  ToolCapability,
  ToolInterface,
  ToolStatus,
  ToolType,
  HealthCheckConfig,
  ToolLifecycleCommands,
  BuiltinToolProvider,
  ToolDescriptor,
} from '@/motor/motor-tool-runner/core/tool-descriptor';
import type { ToolContext } from '@/motor/motor-tool-runner/core/tool-context';

@Injectable()
export class ToolConfigService {
  private readonly logger = new Logger(ToolConfigService.name);

  /** 配置目录路径 */
  private readonly toolsDir: string;

  constructor() {
    this.toolsDir = path.join(os.homedir(), DEFAULT_TOOLS_DIR);
  }

  /**
   * 获取配置目录
   */
  getToolsDir(): string {
    return this.toolsDir;
  }

  /**
   * 获取工具目录是否存在
   */
  isToolsDirExists(): boolean {
    return fs.existsSync(this.toolsDir);
  }

  /**
   * 创建工具配置目录和默认文件
   */
  async initialize(): Promise<void> {
    const toolsDir = this.toolsDir;
    const toolsSubDir = path.join(toolsDir, 'tools');

    // 创建目录
    if (!fs.existsSync(toolsDir)) {
      fs.mkdirSync(toolsDir, { recursive: true });
      this.logger.log(`创建工具配置目录: ${toolsDir}`);
    }

    if (!fs.existsSync(toolsSubDir)) {
      fs.mkdirSync(toolsSubDir, { recursive: true });
      this.logger.log(`创建工具子目录: ${toolsSubDir}`);
    }

    // 创建默认 index.json
    const indexPath = path.join(toolsDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
      const defaultIndex: ToolIndex = {
        version: '1.0',
        lastUpdated: Date.now(),
        tools: [],
      };
      fs.writeFileSync(indexPath, JSON.stringify(defaultIndex, null, 2), 'utf-8');
      this.logger.log(`创建默认索引文件: ${indexPath}`);
    }

    // 创建示例工具配置
    await this.createSampleTools();
  }

  /**
   * 重新加载所有工具配置
   * @param builtinProviders 内置工具提供者
   */
  async reload(builtinProviders: BuiltinToolProvider[] = []): Promise<ToolInstance[]> {
    const index = this.loadIndex();
    const tools: ToolInstance[] = [];

    // 动态加载的 provider 缓存（providerModule 解析结果），与传入的 builtinProviders 合并使用
    const dynamicProviders: BuiltinToolProvider[] = [];

    for (const item of index.tools) {
      if (!item.enabled) {
        this.logger.debug(`工具 ${item.id} 已禁用，跳过`);
        continue;
      }

      const config = this.loadToolConfig(item.configFile);
      if (config) {
        // 新机制：若配置声明了 providerModule，先 dynamicImport 加载 provider
        if (config.providerModule) {
          const existing = dynamicProviders.find(p => p.providerId === config.id);
          if (!existing) {
            const provider = await this.loadProviderFromModule(
              config.providerModule,
              config.providerExport,
              config.id,
            );
            if (provider) {
              dynamicProviders.push(provider);
            }
          }
        }
        const instance = this.toToolInstance(config, [...builtinProviders, ...dynamicProviders]);
        tools.push(instance);
      }
    }

    return tools;
  }

  /**
   * 通过 dynamicImport 从外部包加载 BuiltinToolProvider。
   *
   * 支持两种导出形态：
   * - 工厂对象：{ create(): BuiltinToolProvider }（推荐，cmux-tools 用此形态）
   * - 直接 provider 实例：BuiltinToolProvider（兼容）
   *
   * 用 new Function 包裹 import，防止打包器静态分析（沿用 pi-coding-provider 先例）。
   * 加载失败返回 null 并记日志，不阻断其他工具加载。
   */
  private async loadProviderFromModule(
    moduleName: string,
    exportName: string | undefined,
    toolId: string,
  ): Promise<BuiltinToolProvider | null> {
    const dynamicImport = <T = unknown>(specifier: string): Promise<T> =>
      new Function('specifier', 'return import(specifier)')(specifier);

    try {
      const mod = (await dynamicImport(moduleName)) as Record<string, unknown>;
      const target = mod[exportName || 'default'];
      if (!target) {
        this.logger.error(`工具 ${toolId} 动态加载 provider 失败: 包 ${moduleName} 无导出 ${exportName || 'default'}`);
        return null;
      }
      // 工厂对象形态
      if (typeof (target as { create?: unknown }).create === 'function') {
        const provider = (target as { create: () => BuiltinToolProvider }).create();
        this.logger.log(`工具 ${toolId} 动态加载 provider 成功(工厂): ${moduleName}`);
        return provider;
      }
      // 直接 provider 实例形态
      if (typeof (target as { createInstance?: unknown }).createInstance === 'function') {
        this.logger.log(`工具 ${toolId} 动态加载 provider 成功(实例): ${moduleName}`);
        return target as BuiltinToolProvider;
      }
      this.logger.error(
        `工具 ${toolId} 动态加载 provider 失败: ${moduleName}.${exportName || 'default'} 既非工厂也非 provider 实例`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `工具 ${toolId} 动态加载 provider 异常 (${moduleName}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 加载工具索引
   */
  loadIndex(): ToolIndex {
    const indexPath = path.join(this.toolsDir, 'index.json');

    if (!fs.existsSync(indexPath)) {
      this.logger.warn(`索引文件不存在: ${indexPath}`);
      return { version: '1.0', lastUpdated: 0, tools: [] };
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(content) as ToolIndex;
      this.logger.debug(`已加载索引: ${index.tools.length} 个工具`);
      return index;
    } catch (error) {
      this.logger.error(`读取索引文件失败: ${error}`);
      return { version: '1.0', lastUpdated: 0, tools: [] };
    }
  }

  /**
   * 加载单个工具配置
   */
  loadToolConfig(configFile: string): ToolConfig | null {
    const configPath = path.join(this.toolsDir, configFile);

    if (!fs.existsSync(configPath)) {
      this.logger.warn(`工具配置文件不存在: ${configPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as ToolConfig;
      this.logger.debug(`已加载工具配置: ${config.id}`);
      return config;
    } catch (error) {
      this.logger.error(`读取工具配置失败 ${configFile}: ${error}`);
      return null;
    }
  }

  /**
   * 保存工具配置到文件
   */
  saveToolConfig(config: ToolConfig): boolean {
    const configFile = `tools/${config.id}.json`;
    const configPath = path.join(this.toolsDir, configFile);

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.updateIndex(config.id, config.name, true, configFile);
      this.logger.log(`已保存工具配置: ${config.id}`);
      return true;
    } catch (error) {
      this.logger.error(`保存工具配置失败 ${config.id}: ${error}`);
      return false;
    }
  }

  /**
   * 从索引中移除工具
   */
  removeTool(toolId: string): boolean {
    const index = this.loadIndex();
    const itemIndex = index.tools.findIndex(t => t.id === toolId);

    if (itemIndex === -1) {
      return false;
    }

    const item = index.tools[itemIndex];

    // 删除配置文件
    const configPath = path.join(this.toolsDir, item.configFile);
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    // 从索引中移除
    index.tools.splice(itemIndex, 1);
    index.lastUpdated = Date.now();
    this.saveIndex(index);

    this.logger.log(`已从索引中移除工具: ${toolId}`);
    return true;
  }

  /**
   * 更新工具在索引中的信息
   */
  updateIndex(id: string, name: string, enabled: boolean, configFile: string): void {
    const index = this.loadIndex();
    const existing = index.tools.find(t => t.id === id);

    if (existing) {
      existing.name = name;
      existing.enabled = enabled;
      existing.configFile = configFile;
    } else {
      index.tools.push({ id, name, enabled, configFile });
    }

    index.lastUpdated = Date.now();
    this.saveIndex(index);
  }

  /**
   * 保存索引文件
   */
  private saveIndex(index: ToolIndex): void {
    const indexPath = path.join(this.toolsDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 将 ToolConfig 转换为 ToolInstance
   */
  private toToolInstance(config: ToolConfig, builtinProviders: BuiltinToolProvider[] = []): ToolInstance {
    const capabilities: ToolCapability[] = config.capabilities.map(cap => ({
      name: cap.name,
      description: cap.description,
      parametersSchema: cap.parameters as Record<string, unknown>,
    }));

    const interfaces: ToolInterface[] = (config.interfaces || []).map(iface => ({
      name: iface.name,
      type: iface.type,
      endpoint: iface.endpoint,
      port: iface.port,
      path: iface.path,
      auth: iface.auth,
      description: iface.description,
    }));

    const lifecycle: ToolLifecycleCommands | undefined = config.lifecycle ? {
      start: config.lifecycle.start,
      startCwd: config.lifecycle.startCwd,
      stop: config.lifecycle.stop,
      restart: config.lifecycle.restart,
      env: config.lifecycle.env,
    } : undefined;

    const healthCheck: HealthCheckConfig | undefined = config.healthCheck ? {
      type: config.healthCheck.type,
      endpoint: config.healthCheck.endpoint,
      command: config.healthCheck.command,
      intervalMs: config.healthCheck.intervalMs,
      timeoutMs: config.healthCheck.timeoutMs,
      maxRetries: config.healthCheck.maxRetries,
    } : undefined;

    // 基础描述符
    const descriptor: ToolDescriptor = {
      id: config.id,
      name: config.name,
      version: config.version,
      description: config.description,
      type: config.type as ToolType,
      filePath: config.path,
      lifecycle,
      capabilities,
      interfaces,
      config: config.config || {},
      healthCheck,
      providerModule: config.providerModule,
      providerExport: config.providerExport,
    };

    // 如果是 builtin 类型，尝试使用 provider
    if (descriptor.type === 'builtin') {
      const provider = builtinProviders.find(p => p.providerId === descriptor.id);
      if (provider) {
        this.logger.debug(`为工具 ${descriptor.id} 匹配到内置 Provider`);
        return provider.createInstance(descriptor);
      }
    }

    // 根据工具类型实现默认 execute (shell/process/builtin-fallback)
    const toolType = descriptor.type;
    let executeImpl: ToolInstance['execute'];

    switch (toolType) {
      case 'shell':
        // Shell 类型：执行配置中的 command 模板
        executeImpl = async (capability, params) => {
          const commandTemplate = (config as any).command;
          if (!commandTemplate) {
            return {
              success: false,
              error: {
                code: 'NO_SHELL_COMMAND',
                message: `工具 ${config.id} 未配置 shell command`,
              },
            };
          }
          // 替换模板变量 {{paramName}} 为实际参数
          let command = commandTemplate;
          for (const [key, value] of Object.entries(params)) {
            command = command.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
          }
          return new Promise((resolve) => {
            const child = spawn(command, { shell: true });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });
            child.on('close', (code) => {
              resolve({
                success: code === 0,
                data: stdout.trim() || undefined,
                error: code !== 0 ? {
                  code: 'SHELL_ERROR',
                  message: stderr.trim() || `命令退出码: ${code}`,
                } : undefined,
              });
            });
            child.on('error', (err) => {
              resolve({
                success: false,
                error: { code: 'SHELL_ERROR', message: err.message },
              });
            });
          });
        };
        break;

      case 'process':
        // Process 类型：通过接口调用
        executeImpl = async (capability, params) => {
          // 找到 capability 对应的接口
          const capabilityConfig = config.capabilities.find(c => c.name === capability);
          const interfaceName = capabilityConfig?.interface;
          const iface = config.interfaces?.find(i => i.name === interfaceName);

          if (!iface) {
            return {
              success: false,
              error: {
                code: 'INTERFACE_NOT_FOUND',
                message: `能力 ${capability} 未找到对应的接口配置`,
              },
            };
          }

          // 根据接口类型调用
          switch (iface.type) {
            case 'http':
              return this.callHttpInterface(iface, params, capability);
            case 'stdin':
              return this.callStdinInterface(iface, params, capability);
            default:
              return {
                success: false,
                error: {
                  code: 'UNSUPPORTED_INTERFACE',
                  message: `接口类型 ${iface.type} 暂不支持`,
                },
              };
          }
        };
        break;

      case 'builtin':
      default:
        executeImpl = async () => ({
          success: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: `工具 ${config.id} 未实现 execute 方法 (Builtin Provider 未匹配)`,
          },
        });
        break;
    }

    return {
      descriptor,
      status: 'idle' as ToolStatus,
      initialize: undefined,
      execute: executeImpl,
      destroy: undefined,
    };
  }

  /**
   * 创建示例工具配置
   */
  private async createSampleTools(): Promise<void> {
    const sampleTools: ToolConfig[] = [
      {
        id: 'example-hello',
        name: 'Hello World 示例',
        version: '1.0.0',
        description: '一个简单的示例工具，展示工具配置格式',
        type: 'builtin',
        enabled: false, // 默认禁用
        capabilities: [
          {
            name: 'hello.greet',
            description: '打招呼',
            parameters: {
              name: { type: 'string', required: false, default: 'World', description: '被问候的名字' },
            },
          },
        ],
      },
      {
        id: 'pi-coding-tools',
        name: 'System Coding Tools',
        version: '1.0.0',
        description: 'pi-coding-agent 提供的代码能力 (read/bash/edit/ls 等)',
        type: 'builtin',
        enabled: true,
        capabilities: [
          { name: 'read', description: 'Read file content' },
          { name: 'bash', description: 'Execute shell commands' },
          { name: 'edit', description: 'Edit file content with search/replace' },
          { name: 'write', description: 'Write or overwrite file content' },
          { name: 'ls', description: 'List files and directories' },
          { name: 'grep', description: 'Search for text patterns in files' },
          { name: 'find', description: 'Find files by name' },
        ],
        config: {
          cwd: process.cwd(),
        },
      },
      {
        id: 'system-session-tools',
        name: 'System Session Tools',
        version: '1.0.0',
        description: '系统会话管理工具',
        type: 'builtin',
        enabled: true,
        capabilities: [
          {
            name: 'get_session_meta',
            description: 'Read agent session metadata by sessionId.',
            parameters: {
              sessionId: { type: 'string', required: false, description: '会话 ID' },
            },
          },
        ],
      },
    ];

    for (const config of sampleTools) {
      const configFile = `tools/${config.id}.json`;
      const configPath = path.join(this.toolsDir, configFile);

      if (!fs.existsSync(configPath)) {
        // 详情文件不含 enabled（单一真相源在 index.json）
        const { enabled: _omit, ...detailConfig } = config;
        fs.writeFileSync(configPath, JSON.stringify(detailConfig, null, 2), 'utf-8');
        this.updateIndex(config.id, config.name, config.enabled ?? false, configFile);
        this.logger.log(`创建示例工具配置: ${config.id}`);
      }
    }

    // 注意：独立包工具（如 cmux）的配置同步不在启动时自动做，
    // 由 motor.tool.install 命令在「安装/升级工具包」时显式触发。
    // 这样用户磁盘的 enabled 等运行时状态不会被无故重置。
  }

  /**
   * 安装/同步工具包配置 —— 由 motor.tool.install 命令调用。
   *
   * 按 toolId 从已注册的工具配置里查 providerModule，再从包内 config/<id>.json
   * 同步到用户磁盘。覆盖配置结构（capabilities/config 等），**保留磁盘已有 enabled**
   * （首次安装用包默认值）。
   *
   * 不在 backend 启动时自动调用 —— 安装是用户显式动作，避免运行时状态被重置。
   *
   * @returns { success, data?: {firstInstall, enabled, capabilities}, error? }
   */
  async installToolConfig(toolId: string): Promise<{
    success: boolean;
    data?: { firstInstall: boolean; enabled: boolean; capabilities: number; moduleName: string };
    error?: { code: string; message: string };
  }> {
    // 1. 从磁盘已有的工具配置读 providerModule（确定包名）
    const index = this.loadIndex();
    const indexItem = index.tools.find((t) => t.id === toolId);
    let moduleName: string | undefined;
    if (indexItem) {
      const cfg = this.loadToolConfig(indexItem.configFile);
      moduleName = cfg?.providerModule;
    }
    if (!moduleName) {
      // 磁盘无配置或无 providerModule → 工具不是独立包工具
      return {
        success: false,
        error: {
          code: 'NOT_PACKAGE_TOOL',
          message: `工具 ${toolId} 未在磁盘登记 providerModule，无法同步（仅支持独立包工具）`,
        },
      };
    }

    return this.syncPackageToolConfig(moduleName, toolId);
  }

  /**
   * 从独立工具包内的 config/<id>.json 同步到用户磁盘。
   *
   * 覆盖策略：配置结构（capabilities / config / description 等）覆盖为包的最新版，
   * 但 **enabled 字段保留用户磁盘已有值**（启用状态是用户的运行时开关，
   * 不应被包的出厂默认值重置；首次生成时用包的默认值）。
   *
   * @param moduleName 包名（须在 backend dependencies 里，可被 require.resolve）
   * @param toolId 工具 id（同时是 config 文件名 <id>.json）
   */
  async syncPackageToolConfig(
    moduleName: string,
    toolId: string,
  ): Promise<{
    success: boolean;
    data?: { firstInstall: boolean; enabled: boolean; capabilities: number; moduleName: string };
    error?: { code: string; message: string };
  }> {
    let pkgConfigPath: string;
    try {
      pkgConfigPath = require.resolve(`${moduleName}/config/${toolId}.json`);
    } catch {
      return {
        success: false,
        error: {
          code: 'PACKAGE_NOT_FOUND',
          message: `包 ${moduleName} 未安装或缺少 config/${toolId}.json`,
        },
      };
    }

    let pkgConfig: Record<string, unknown>;
    try {
      pkgConfig = JSON.parse(fs.readFileSync(pkgConfigPath, 'utf-8'));
    } catch (error) {
      return {
        success: false,
        error: { code: 'PACKAGE_CONFIG_INVALID', message: `包配置 JSON 解析失败: ${error}` },
      };
    }

    const configFile = `tools/${toolId}.json`;
    const destPath = path.join(this.toolsDir, configFile);
    const firstInstall = !fs.existsSync(destPath);

    // enabled 的单一真相源是 index.json，不从详情文件读。
    // 已安装的工具保留 index.json 现有 enabled；首次安装用包默认值。
    let enabled: boolean;
    if (firstInstall) {
      enabled = (pkgConfig.enabled as boolean) ?? false;
    } else {
      const index = this.loadIndex();
      const existing = index.tools.find((t) => t.id === toolId);
      enabled = existing ? existing.enabled : (pkgConfig.enabled as boolean) ?? false;
    }

    try {
      // 详情文件不含 enabled（enabled 只存 index.json）
      const { enabled: _omit, ...detailConfig } = pkgConfig;
      fs.writeFileSync(destPath, JSON.stringify(detailConfig, null, 2), 'utf-8');
      this.updateIndex(toolId, (pkgConfig.name as string) ?? toolId, enabled, configFile);
      const capabilities = Array.isArray(pkgConfig.capabilities) ? pkgConfig.capabilities.length : 0;
      this.logger.log(
        `安装/同步工具配置: ${toolId} (from ${moduleName}, firstInstall=${firstInstall}, enabled=${enabled}, capabilities=${capabilities})`,
      );
      return { success: true, data: { firstInstall, enabled, capabilities, moduleName } };
    } catch (error) {
      return {
        success: false,
        error: { code: 'WRITE_FAILED', message: `写入用户工具配置失败: ${error}` },
      };
    }
  }

  /**
   * 调用 HTTP 接口
   */
  private async callHttpInterface(
    iface: ToolInterfaceConfig,
    params: Record<string, unknown>,
    capability: string,
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    return new Promise((resolve) => {
      const endpoint = iface.endpoint;
      if (!endpoint) {
        resolve({
          success: false,
          error: { code: 'NO_ENDPOINT', message: 'HTTP 接口未配置 endpoint' },
        });
        return;
      }

      const url = new URL(endpoint);
      const client = url.protocol === 'https:' ? require('https') : require('http');

      const postData = JSON.stringify(params);
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      // 添加认证头
      if (iface.auth === 'bearer' && (iface as any).token) {
        options.headers!['Authorization'] = `Bearer ${(iface as any).token}`;
      } else if (iface.auth === 'basic' && (iface as any).username) {
        const credentials = Buffer.from(`${(iface as any).username}:${(iface as any).password || ''}`).toString('base64');
        options.headers!['Authorization'] = `Basic ${credentials}`;
      }

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              success: res.statusCode !== undefined && res.statusCode < 400,
              data: parsed,
              error: res.statusCode !== undefined && res.statusCode >= 400
                ? { code: 'HTTP_ERROR', message: `HTTP ${res.statusCode}: ${data}` }
                : undefined,
            });
          } catch {
            resolve({
              success: res.statusCode !== undefined && res.statusCode < 400,
              data: data,
              error: res.statusCode !== undefined && res.statusCode >= 400
                ? { code: 'HTTP_ERROR', message: `HTTP ${res.statusCode}: ${data}` }
                : undefined,
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          error: { code: 'HTTP_ERROR', message: err.message },
        });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        resolve({
          success: false,
          error: { code: 'TIMEOUT', message: 'HTTP 请求超时' },
        });
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 调用 stdin 接口（用于 Motor 启动的本地进程）
   */
  private async callStdinInterface(
    iface: ToolInterfaceConfig,
    params: Record<string, unknown>,
    capability: string,
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    return new Promise((resolve) => {
      // stdin 接口需要进程已通过 lifecycle 启动
      // 目前通过 tool-registry 获取运行中的进程
      // 简化实现：直接返回错误，提示需要通过 process 类型工具的 lifecycle 管理进程
      resolve({
        success: false,
        error: {
          code: 'STDIN_NOT_IMPLEMENTED',
          message: 'stdin 接口调用需要在 tool-registry 中实现进程管理，当前请使用 HTTP 接口',
        },
      });
    });
  }
}
