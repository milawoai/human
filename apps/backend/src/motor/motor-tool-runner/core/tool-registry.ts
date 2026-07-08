/**
 * Motor Tool Runner — 工具注册表
 *
 * 管理所有已注册的工具实例，支持生命周期管理和健康检测
 */
import { Injectable, Logger } from '@nestjs/common';
import { ToolInstance, ToolDescriptor, ToolMetadata, ToolLifecycleCommands } from './tool-descriptor';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);

  /** toolId -> ToolInstance */
  private readonly tools = new Map<string, ToolInstance>();

  /** capabilityName -> toolId[]（反向索引） */
  private readonly capabilityIndex = new Map<string, string[]>();

  /** toolId -> 运行的进程 */
  private readonly processes = new Map<string, ChildProcess>();

  /** toolId -> 健康检测定时器 */
  private readonly healthCheckTimers = new Map<string, NodeJS.Timeout>();

  /** toolId -> 连续失败计数 */
  private readonly failureCount = new Map<string, number>();

  /**
   * 注册工具
   */
  async register(tool: ToolInstance): Promise<void> {
    const { id } = tool.descriptor;

    // 初始化工具
    if (tool.initialize) {
      try {
        await tool.initialize();
      } catch (error) {
        this.logger.error(`工具 ${id} 初始化失败: ${error}`);
        tool.status = 'error';
        throw error;
      }
    }

    // 注册到索引
    this.tools.set(id, tool);

    // 建立能力反向索引
    for (const cap of tool.descriptor.capabilities) {
      const existing = this.capabilityIndex.get(cap.name) || [];
      if (!existing.includes(id)) {
        existing.push(id);
        this.capabilityIndex.set(cap.name, existing);
      }
    }

    // 启动健康检测（如果配置了）
    if (tool.descriptor.healthCheck) {
      this.startHealthCheck(tool);
    } else {
      // 无健康检测的工具（如 builtin/shell），直接标记为 ready
      tool.status = 'ready';
    }

    this.logger.log(`工具注册: ${id} (${tool.descriptor.type}), 能力: ${tool.descriptor.capabilities.map(c => c.name).join(', ')}`);
  }

  /**
   * 注销工具
   */
  async unregister(toolId: string): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return;
    }

    // 停止健康检测
    this.stopHealthCheck(toolId);

    // 停止进程
    await this.stopProcess(toolId);

    // 销毁工具
    if (tool.destroy) {
      try {
        await tool.destroy();
      } catch (error) {
        this.logger.warn(`工具 ${toolId} 销毁时出错: ${error}`);
      }
    }

    // 清理能力反向索引
    for (const cap of tool.descriptor.capabilities) {
      const existing = this.capabilityIndex.get(cap.name) || [];
      const idx = existing.indexOf(toolId);
      if (idx !== -1) {
        existing.splice(idx, 1);
        if (existing.length === 0) {
          this.capabilityIndex.delete(cap.name);
        }
      }
    }

    this.failureCount.delete(toolId);
    this.tools.delete(toolId);
    this.logger.log(`工具注销: ${toolId}`);
  }

  /**
   * 获取工具
   */
  get(toolId: string): ToolInstance | undefined {
    return this.tools.get(toolId);
  }

  /**
   * 检查工具是否存在
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * 列出所有工具描述符
   */
  listDescriptors(): ToolDescriptor[] {
    return Array.from(this.tools.values()).map((t) => t.descriptor);
  }

  /**
   * 获取所有工具的完整元数据
   */
  listMetadata(): ToolMetadata[] {
    return Array.from(this.tools.values()).map((t) => this.toMetadata(t));
  }

  /**
   * 获取单个工具的完整元数据
   */
  getMetadata(toolId: string): ToolMetadata | undefined {
    const tool = this.tools.get(toolId);
    return tool ? this.toMetadata(tool) : undefined;
  }

  /**
   * 根据能力名称查找工具
   * 返回第一个匹配的工具
   */
  findByCapability(capability: string): ToolInstance | undefined {
    const toolIds = this.capabilityIndex.get(capability);
    if (!toolIds || toolIds.length === 0) {
      return undefined;
    }
    // 返回第一个匹配的工具
    return this.tools.get(toolIds[0]);
  }

  /**
   * 根据能力名称查找所有工具
   */
  findAllByCapability(capability: string): ToolInstance[] {
    const toolIds = this.capabilityIndex.get(capability) || [];
    return toolIds.map((id) => this.tools.get(id)).filter(Boolean) as ToolInstance[];
  }

  /**
   * 获取所有工具的状态概览
   */
  getStatus(): Array<{ id: string; name: string; status: string }> {
    return Array.from(this.tools.values()).map((t) => ({
      id: t.descriptor.id,
      name: t.descriptor.name,
      status: t.status,
    }));
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * 获取所有工具实例（用于 AgentTool 转换）
   */
  getAllInstances(): ToolInstance[] {
    return Array.from(this.tools.values());
  }

  /**
   * 启动工具
   *
   * 优先调用工具实例自提供的 start()（用于拉起外部应用等自定义启动逻辑）；
   * 未实现时回退到 descriptor.lifecycle.start 命令模式（spawn 子进程）。
   *
   * @param options 透传给工具 start() 的选项，如 { force?: boolean }
   */
  async startTool(toolId: string, options?: { force?: boolean }): Promise<boolean> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      this.logger.warn(`启动工具失败: ${toolId} 不存在`);
      return false;
    }

    // 路径 A：工具自提供 start()
    if (typeof tool.start === 'function') {
      this.logger.log(`启动工具(自定义): ${toolId}`);
      try {
        const result = await tool.start(options);
        if (result.success) {
          tool.status = 'running';
        } else {
          this.logger.warn(`工具 ${toolId} 自定义启动返回失败: ${result.error?.message ?? ''}`);
          tool.status = 'error';
        }
        return result.success;
      } catch (error) {
        this.logger.error(`工具 ${toolId} 自定义启动异常: ${error}`);
        tool.status = 'error';
        return false;
      }
    }

    // 路径 B：lifecycle 命令模式（回退）
    const lifecycle = tool.descriptor.lifecycle;
    if (!lifecycle?.start) {
      this.logger.debug(`工具 ${toolId} 无启动命令也无 start() 实现`);
      return false;
    }

    try {
      // 替换模板变量
      const command = this.resolveCommand(lifecycle.start, tool.descriptor.config);
      const cwd = lifecycle.startCwd || process.cwd();
      const env = { ...process.env, ...lifecycle.env };

      this.logger.log(`启动工具 ${toolId}: ${command}`);

      const child = spawn(command, [], {
        shell: true,
        cwd,
        env,
        stdio: 'pipe',
      });

      child.on('error', (err) => {
        this.logger.error(`工具 ${toolId} 进程错误: ${err.message}`);
        tool.status = 'error';
      });

      child.on('exit', (code) => {
        this.logger.log(`工具 ${toolId} 进程退出, code: ${code}`);
        if (tool.status !== 'error') {
          tool.status = code === 0 ? 'stopped' : 'error';
        }
      });

      this.processes.set(toolId, child);
      tool.status = 'running';

      return true;
    } catch (error) {
      this.logger.error(`启动工具 ${toolId} 失败: ${error}`);
      return false;
    }
  }

  /**
   * 停止工具
   *
   * 优先调用工具实例自提供的 stop()；未实现时回退到停止 lifecycle 启动的子进程。
   */
  async stopTool(toolId: string): Promise<boolean> {
    const tool = this.tools.get(toolId);
    if (tool && typeof tool.stop === 'function') {
      this.logger.log(`停止工具(自定义): ${toolId}`);
      try {
        const result = await tool.stop();
        if (result.success) {
          tool.status = 'stopped';
        }
        return result.success;
      } catch (error) {
        this.logger.error(`工具 ${toolId} 自定义停止异常: ${error}`);
        return false;
      }
    }
    return this.stopProcess(toolId);
  }

  /**
   * 重启工具
   */
  async restartTool(toolId: string): Promise<boolean> {
    await this.stopTool(toolId);
    return this.startTool(toolId, { force: true });
  }

  // ──────────────────────────────────────────────
  // 私有方法
  // ──────────────────────────────────────────────

  /**
   * 转换工具实例为元数据
   */
  private toMetadata(tool: ToolInstance): ToolMetadata {
    const lifecycle = tool.descriptor.lifecycle;
    const healthCheck = tool.descriptor.healthCheck;

    return {
      id: tool.descriptor.id,
      name: tool.descriptor.name,
      version: tool.descriptor.version,
      description: tool.descriptor.description,
      type: tool.descriptor.type,
      filePath: tool.descriptor.filePath,
      capabilities: tool.descriptor.capabilities.map((c) => c.name),
      interfaces: tool.descriptor.interfaces || [],
      startCommand: lifecycle?.start,
      stopCommand: lifecycle?.stop,
      healthCheckType: healthCheck?.type,
      healthCheckEndpoint: healthCheck?.endpoint,
      status: tool.status,
      registeredAt: 0, // TODO: 可以记录注册时间
    };
  }

  /**
   * 解析命令中的模板变量
   */
  private resolveCommand(command: string, config: Record<string, unknown>): string {
    return command.replace(/\$\{(\w+)\}/g, (_, key) => String(config[key] || ''));
  }

  /**
   * 停止进程
   */
  private async stopProcess(toolId: string): Promise<boolean> {
    const child = this.processes.get(toolId);
    if (!child) {
      return false;
    }

    const tool = this.tools.get(toolId);
    const lifecycle = tool?.descriptor.lifecycle;

    try {
      // 先尝试优雅关闭
      if (lifecycle?.stop) {
        const stopCommand = this.resolveCommand(lifecycle.stop, tool?.descriptor.config || {});
        spawn(stopCommand, { shell: true });
        // 等待一段时间让进程优雅退出
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 强制 kill
      if (!child.killed) {
        child.kill('SIGKILL');
      }

      this.processes.delete(toolId);
      return true;
    } catch (error) {
      this.logger.error(`停止工具 ${toolId} 失败: ${error}`);
      return false;
    }
  }

  /**
   * 启动健康检测
   */
  private startHealthCheck(tool: ToolInstance): void {
    const healthCheck = tool.descriptor.healthCheck;
    if (!healthCheck) return;

    const intervalMs = healthCheck.intervalMs || 30000;
    const maxRetries = healthCheck.maxRetries || 3;

    const timer = setInterval(async () => {
      try {
        const toolId = tool.descriptor.id;
        const isHealthy = await this.checkHealth(toolId, healthCheck);

        if (isHealthy) {
          this.failureCount.set(toolId, 0);
          if (tool.status !== 'ready' && tool.status !== 'running') {
            tool.status = 'ready';
            this.logger.log(`工具 ${toolId} 健康检测通过`);
          }
        } else {
          const count = (this.failureCount.get(toolId) || 0) + 1;
          this.failureCount.set(toolId, count);
          this.logger.warn(`工具 ${toolId} 健康检测失败 (${count}/${maxRetries})`);

          if (count >= maxRetries) {
            tool.status = 'error';
            this.logger.error(`工具 ${toolId} 健康检测失败超过阈值，标记为 error`);
          }
        }
      } catch (error) {
        this.logger.error(`工具 ${tool.descriptor.id} 健康检测异常: ${error}`);
      }
    }, intervalMs);

    this.healthCheckTimers.set(tool.descriptor.id, timer);
  }

  /**
   * 停止健康检测
   */
  private stopHealthCheck(toolId: string): void {
    const timer = this.healthCheckTimers.get(toolId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(toolId);
    }
    this.failureCount.delete(toolId);
  }

  /**
   * 执行健康检测
   */
  private checkHealth(toolId: string, config: import('./tool-descriptor').HealthCheckConfig): Promise<boolean> {
    return new Promise((resolve) => {
      switch (config.type) {
        case 'http': {
          if (!config.endpoint) return resolve(false);
          const url = new URL(config.endpoint);
          const client = url.protocol === 'https:' ? https : http;
          const req = client.request(config.endpoint, { method: 'GET' }, (res) => {
            resolve(res.statusCode !== undefined && res.statusCode < 500);
          });
          req.on('error', () => resolve(false));
          req.setTimeout(config.timeoutMs || 5000, () => {
            req.destroy();
            resolve(false);
          });
          break;
        }

        case 'tcp': {
          if (!config.endpoint) return resolve(false);
          const [host, port] = config.endpoint.split(':');
          const net = require('net');
          const socket = net.createConnection(Number(port) || 80, host);
          socket.setTimeout(config.timeoutMs || 5000);
          socket.on('connect', () => {
            socket.destroy();
            resolve(true);
          });
          socket.on('error', () => resolve(false));
          socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
          });
          break;
        }

        case 'command': {
          if (!config.command) return resolve(false);
          const child = spawn(config.command, { shell: true });
          const timeout = setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
            resolve(false);
          }, config.timeoutMs || 5000);
          child.on('close', (code) => {
            clearTimeout(timeout);
            resolve(code === 0);
          });
          child.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
          });
          break;
        }

        default:
          resolve(false);
      }
    });
  }
}