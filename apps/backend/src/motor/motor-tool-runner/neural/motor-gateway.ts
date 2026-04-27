/**
 * Motor Tool Runner — Neural Core 网关
 *
 * 负责与 Neural Core 通信：注册 Actor/Capability、发送事件
 */
import { Injectable, Logger } from '@nestjs/common';
import { NeuralCoreService } from '@/neural/neural-core/neural-core.service';
import { Capability, BusMessage, ActorRef } from '@/neural/interfaces';
import {
  MOTOR_TOOL_RUNNER_ACTOR,
  MOTOR_TOPICS,
  ToolInstance,
} from '@/motor/motor-tool-runner/core/tool-descriptor';

@Injectable()
export class MotorGateway {
  private readonly logger = new Logger(MotorGateway.name);

  constructor(private readonly coreService: NeuralCoreService) {}

  /**
   * 注册 Motor Tool Runner 为内部 Actor
   */
  register(): void {
    this.coreService.registerInternalActor(MOTOR_TOOL_RUNNER_ACTOR);
    this.logger.log(`Motor Tool Runner Actor 注册: ${MOTOR_TOOL_RUNNER_ACTOR.actorId}`);
  }

  /**
   * 注册工具的 Capabilities 到 Neural Core
   */
  registerToolCapabilities(tool: ToolInstance): void {
    const capabilities: Capability[] = tool.descriptor.capabilities.map((cap) => ({
      id: `${tool.descriptor.id}.${cap.name}`,
      actor: MOTOR_TOOL_RUNNER_ACTOR,
      topic: MOTOR_TOPICS.TOOL_EXECUTE,
      kinds: ['command', 'query'] as const,
      mode: 'once' as const,
      enabled: true,
      online: true,
    }));

    // 注册 list 和 status 能力
    capabilities.push({
      id: `${tool.descriptor.id}.list`,
      actor: MOTOR_TOOL_RUNNER_ACTOR,
      topic: MOTOR_TOPICS.TOOL_LIST,
      kinds: ['query'] as const,
      mode: 'once' as const,
      enabled: true,
      online: true,
    });

    capabilities.push({
      id: `${tool.descriptor.id}.status`,
      actor: MOTOR_TOOL_RUNNER_ACTOR,
      topic: MOTOR_TOPICS.TOOL_STATUS,
      kinds: ['query'] as const,
      mode: 'once' as const,
      enabled: true,
      online: true,
    });

    this.coreService.registerCapabilities(capabilities);
    this.logger.log(
      `工具 Capabilities 注册: ${tool.descriptor.id}, 数量: ${capabilities.length}`,
    );
  }

  /**
   * 发送事件到 Neural Core（广播给订阅者）
   */
  async emit(topic: string, payload: unknown): Promise<void> {
    const message: BusMessage = {
      id: this.generateId(),
      kind: 'event',
      topic,
      source: MOTOR_TOOL_RUNNER_ACTOR,
      timestamp: Date.now(),
      payload,
    };

    try {
      await this.coreService.route(message);
      this.logger.debug(`事件发送: ${topic}`);
    } catch (error) {
      this.logger.error(`事件发送失败: ${topic}, ${error}`);
    }
  }

  /**
   * 发送响应到指定 target
   */
  async reply(
    target: ActorRef,
    correlationId: string,
    payload: unknown,
  ): Promise<void> {
    const message: BusMessage = {
      id: this.generateId(),
      kind: 'response',
      topic: MOTOR_TOPICS.TOOL_EXECUTE,
      source: MOTOR_TOOL_RUNNER_ACTOR,
      target,
      timestamp: Date.now(),
      correlationId,
      payload,
    };

    try {
      await this.coreService.route(message);
      this.logger.debug(`响应发送: ${correlationId}`);
    } catch (error) {
      this.logger.error(`响应发送失败: ${correlationId}, ${error}`);
    }
  }

  private generateId(): string {
    return `motor-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
