/**
 * BrainInitService — Brain 初始化服务
 *
 * 职责：
 * - 注册 brain-main 内部 Actor 到 NeuralCoreService
 * - 处理 brain.init.execute command（创建 .ai_secretary/ 配置目录）
 * - 通过 NeuralWsGateway 推送 init_done / init_error 事件
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BusMessage, Capability } from '../../neural/interfaces';
import { NeuralCoreService } from '../../neural/neural-core/neural-core.service';
import { NeuralWsGateway } from '../../neural/neural-ws/neural-ws.gateway';
import type { InternalCommandHandler } from '../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../neural/neural-http/neural-http.service';

/** Brain Actor 定义 */
const BRAIN_ACTOR = {
  actorId: 'brain-main',
  runtime: 'nest' as const,
  system: 'brain' as const,
  module: 'init',
};

/** Brain init Capability */
const BRAIN_INIT_CAPABILITY: Capability = {
  id: 'brain.init',
  actor: BRAIN_ACTOR,
  topic: 'brain.init.execute',
  kinds: ['command'],
  mode: 'once',
  enabled: true,
  online: true,
};

const DEFAULT_CONFIG = {
  version: 1,
  brain: {
    defaultProfile: '',
    profiles: {},
  },
} as const;

const DEFAULT_SECRETS_ENV_EXAMPLE = `# AI Secretary secret keys (example)
# Copy this file to ~/.ai_secretary/secrets.env and fill real values.
# Do NOT commit secrets.env to git.

ZAI_API_KEY=
KIMI_API_KEY=
MINIMAX_API_KEY=
OPENROUTER_API_KEY=
`;

@Injectable()
export class BrainInitService implements OnModuleInit, InternalCommandHandler {
  private readonly logger = new Logger(BrainInitService.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
    private readonly httpService: NeuralHttpService,
  ) {}

  async onModuleInit() {
    this.logger.log('── BrainInitService onModuleInit 开始 ──');

    // 1. 注册内部 Actor（无需 WS 连接）
    this.coreService.registerInternalActor(BRAIN_ACTOR);
    this.logger.log('① 内部 Actor 已注册: brain-main (runtime=nest, system=brain)');

    // 2. 注册 Capability
    this.coreService.registerCapabilities([BRAIN_INIT_CAPABILITY]);
    this.logger.log('② Capability 已注册: brain.init → topic=brain.init.execute, kinds=[command]');

    // 3. 注册自身为内部命令处理器
    this.httpService.registerCommandHandler(this);
    this.logger.log('③ InternalCommandHandler 已注册到 NeuralHttpService');

    this.logger.log('── BrainInitService onModuleInit 完成 ──');
  }

  // ──────────────────────────────────────────────
  // InternalCommandHandler 实现
  // ──────────────────────────────────────────────

  canHandle(topic: string): boolean {
    const can = topic.startsWith('brain.init');
    this.logger.log(`[canHandle] topic=${topic} → ${can}`);
    return can;
  }

  async handleCommand(message: BusMessage): Promise<{ success: boolean; data?: any; msg?: string }> {
    this.logger.log(`[handleCommand] 收到命令: topic=${message.topic}, id=${message.id}, payload=${JSON.stringify(message.payload)}`);

    if (message.topic === 'brain.init.execute') {
      return this.executeInit(message);
    }

    this.logger.warn(`[handleCommand] 无法处理: topic=${message.topic}`);
    return { success: false, msg: `Brain 无法处理 topic: ${message.topic}` };
  }

  // ──────────────────────────────────────────────
  // Init 执行逻辑
  // ──────────────────────────────────────────────

  /**
   * 执行系统初始化：
   * 1. 确定项目根目录
   * 2. 创建 .ai_secretary/ 目录
   * 3. 创建 .ai_secretary/sqlite/ 目录
   * 4. 推送 init_done / init_error 事件给 WS 订阅者
   */
  private async executeInit(message: BusMessage): Promise<{ success: boolean; data?: any; msg?: string }> {
    this.logger.log('── [executeInit] 开始执行系统初始化 ──');

    try {
      const projectRoot = this.resolveProjectRoot();
      this.logger.log(`[executeInit] 项目根目录: ${projectRoot}`);

      const secretDir = path.join(projectRoot, '.ai_secretary');
      const sqliteDir = path.join(secretDir, 'sqlite');
      const configPath = path.join(secretDir, 'config.json');
      const secretsExamplePath = path.join(secretDir, 'secrets.env.example');

      // 创建目录
      const secretExisted = fs.existsSync(secretDir);
      if (!secretExisted) {
        fs.mkdirSync(secretDir, { recursive: true });
        this.logger.log(`[executeInit] ✓ 创建配置目录: ${secretDir}`);
      } else {
        this.logger.log(`[executeInit] 配置目录已存在: ${secretDir}`);
      }

      const sqliteExisted = fs.existsSync(sqliteDir);
      if (!sqliteExisted) {
        fs.mkdirSync(sqliteDir, { recursive: true });
        this.logger.log(`[executeInit] ✓ 创建 SQLite 目录: ${sqliteDir}`);
      } else {
        this.logger.log(`[executeInit] SQLite 目录已存在: ${sqliteDir}`);
      }

      const configExisted = fs.existsSync(configPath);
      if (!configExisted) {
        fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
        this.logger.log(`[executeInit] ✓ 创建默认配置文件: ${configPath}`);
      } else {
        this.logger.log(`[executeInit] 配置文件已存在: ${configPath}`);
      }

      const secretsExampleExisted = fs.existsSync(secretsExamplePath);
      if (!secretsExampleExisted) {
        fs.writeFileSync(secretsExamplePath, DEFAULT_SECRETS_ENV_EXAMPLE, 'utf-8');
        this.logger.log(`[executeInit] ✓ 创建 secrets 模板: ${secretsExamplePath}`);
      } else {
        this.logger.log(`[executeInit] secrets 模板已存在: ${secretsExamplePath}`);
      }

      const result = {
        projectRoot,
        secretDir,
        sqliteDir,
        configPath,
        secretsExamplePath,
        secretExisted,
        sqliteExisted,
        configExisted,
        secretsExampleExisted,
      };

      // 推送 init_done 事件
      this.logger.log(`[executeInit] 推送 init_done 事件...`);
      this.publishEvent('brain.init.init_done', {
        success: true,
        ...result,
        timestamp: Date.now(),
      });

      this.logger.log(`── [executeInit] 系统初始化完成 ──`);

      return { success: true, data: result };
    } catch (error) {
      const errMsg = (error as Error).message;

      // 推送 init_error 事件
      this.logger.error(`[executeInit] 初始化失败: ${errMsg}`);
      this.publishEvent('brain.init.init_error', {
        success: false,
        error: errMsg,
        timestamp: Date.now(),
      });

      this.logger.log(`── [executeInit] 系统初始化失败 ──`);

      return { success: false, msg: errMsg };
    }
  }

  /**
   * 推送事件给所有 WS 订阅者。
   */
  private publishEvent(topic: string, payload: any): void {
    const eventMessage: BusMessage = {
      id: crypto.randomUUID(),
      kind: 'event',
      topic,
      source: BRAIN_ACTOR,
      timestamp: Date.now(),
      payload,
    };

    // 查找订阅了该 topic 的订阅者
    const subscribers = this.coreService.findSubscribers(topic, 'event');

    this.logger.log(`[publishEvent] topic=${topic}, subscribers=${subscribers.length}`);

    for (const sub of subscribers) {
      this.wsGateway.sendToConnection(sub.connectionId, 'message', eventMessage);
      this.logger.log(`[publishEvent] → 已推送至: actorId=${sub.actor.actorId}, connectionId=${sub.connectionId.substring(0, 8)}...`);
    }

    if (subscribers.length === 0) {
      this.logger.log(`[publishEvent] 无订阅者（Electron 可能尚未订阅 brain.init 事件）`);
    }
  }

  /**
   * 确定项目根目录。
   * 优先使用 payload 中的 root，否则使用当前工作目录。
   */
  /**
   * 确定系统根目录。
   * 统一使用 os.homedir() 拼接 .ai_secretary：
   *   macOS/Linux: ~/.ai_secretary
   *   Windows:     C:\Users\<user>\.ai_secretary
   */
  private resolveProjectRoot(): string {
    return os.homedir();
  }
}
