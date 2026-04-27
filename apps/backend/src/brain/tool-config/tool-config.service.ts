/**
 * ToolConfigService — 工具配置服务
 *
 * 负责从 ~/.ai_secretary/tools/ 目录读取工具配置
 * 配置在每次获取时重新加载（无缓存）
 */
import { Injectable, Logger } from '@nestjs/common';
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
import type { ToolInstance, ToolCapability, ToolInterface, ToolStatus, ToolType, HealthCheckConfig, ToolLifecycleCommands } from '@/motor/motor-tool-runner/core/tool-descriptor';
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
   */
  async reload(): Promise<ToolInstance[]> {
    const index = this.loadIndex();
    const tools: ToolInstance[] = [];

    for (const item of index.tools) {
      if (!item.enabled) {
        this.logger.debug(`工具 ${item.id} 已禁用，跳过`);
        continue;
      }

      const config = this.loadToolConfig(item.configFile);
      if (config) {
        const instance = this.toToolInstance(config);
        tools.push(instance);
      }
    }

    return tools;
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
  private toToolInstance(config: ToolConfig): ToolInstance {
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

    return {
      descriptor: {
        id: config.id,
        name: config.name,
        version: config.version,
        description: config.description,
        type: config.type as ToolType,
        path: config.path,
        lifecycle,
        capabilities,
        interfaces,
        config: config.config || {},
        healthCheck,
      },
      status: 'idle' as ToolStatus,
      initialize: undefined,
      execute: async (capability, params, context) => {
        // 默认实现，实际由具体工具覆盖
        return {
          success: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: `工具 ${config.id} 未实现 execute 方法，请使用 process/service 模式`,
          },
        };
      },
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
    ];

    for (const config of sampleTools) {
      const configFile = `tools/${config.id}.json`;
      const configPath = path.join(this.toolsDir, configFile);

      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        this.updateIndex(config.id, config.name, config.enabled, configFile);
        this.logger.log(`创建示例工具配置: ${config.id}`);
      }
    }
  }
}
