/**
 * NeuralHttpController — HTTP 路由层
 *
 * 仅负责路由转发，业务逻辑在 NeuralHttpService 中。
 */
import { Body, Controller, Post } from '@nestjs/common';
import type { MessageKind } from '../interfaces';
import { NeuralHttpService } from './neural-http.service';

@Controller('neural')
export class NeuralHttpController {
  constructor(private readonly service: NeuralHttpService) {}

  // ──────────────────────────────────────────────
  // 触发类
  // ──────────────────────────────────────────────

  @Post('trigger')
  trigger(
    @Body()
    body: {
      kind: MessageKind;
      topic: string;
      payload?: any;
      source?: { actorId: string; runtime: string; system: string; module?: string };
      target?: { actorId: string; runtime: string; system: string; module?: string };
    },
  ) {
    return this.service.trigger(body);
  }

  // ──────────────────────────────────────────────
  // 查询类
  // ──────────────────────────────────────────────

  @Post('actors/list')
  listActors() {
    return this.service.listActors();
  }

  @Post('capabilities/list')
  listCapabilities(
    @Body() body?: { topic?: string; kind?: MessageKind },
  ) {
    return this.service.listCapabilities(body);
  }

  @Post('subscriptions/list')
  listSubscriptions() {
    return this.service.listSubscriptions();
  }

  /** 中转：获取 Python ASR 模型列表 */
  @Post('sensory/hearing/asr-models')
  listAsrModels() {
    return this.service.listAsrModels();
  }

  // ──────────────────────────────────────────────
  // 管理类
  // ──────────────────────────────────────────────

  @Post('admin/cleanup')
  cleanupStaleActors(
    @Body() body?: { timeoutMs?: number },
  ) {
    return this.service.cleanupStaleActors(body?.timeoutMs);
  }

  @Post('admin/disconnect')
  disconnectActor(@Body() body: { actorId: string }) {
    return this.service.disconnectActor(body.actorId);
  }

  // ──────────────────────────────────────────────
  // 调试类
  // ──────────────────────────────────────────────

  @Post('debug/publish')
  debugPublish(
    @Body()
    body: {
      kind: MessageKind;
      topic: string;
      payload?: any;
    },
  ) {
    return this.service.debugPublish(body);
  }

  @Post('debug/status')
  debugStatus() {
    return this.service.debugStatus();
  }
}
