import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { BusMessage, Capability } from '../../neural/interfaces';
import type { InternalCommandHandler } from '../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../neural/neural-http/neural-http.service';
import { NeuralCoreService } from '../../neural/neural-core/neural-core.service';
import { AutomationService } from './automation.service';

const TOPIC_MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP =
  'motor.animation.focused_app.input_text';

const MOTOR_ANIMATION_ACTOR = {
  actorId: 'motor-animation',
  runtime: 'nest' as const,
  system: 'motor' as const,
  module: 'animation',
};

const MOTOR_ANIMATION_CAPABILITY: Capability = {
  id: 'motor.animation.focused_app.input_text',
  actor: MOTOR_ANIMATION_ACTOR,
  topic: TOPIC_MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP,
  kinds: ['command'],
  mode: 'once',
  enabled: true,
  online: true,
};

@Injectable()
export class AutomationNeuralService
  implements OnModuleInit, InternalCommandHandler
{
  private readonly logger = new Logger(AutomationNeuralService.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly httpService: NeuralHttpService,
    private readonly automationService: AutomationService,
  ) {}

  onModuleInit() {
    this.coreService.registerInternalActor(MOTOR_ANIMATION_ACTOR);
    this.coreService.registerCapabilities([MOTOR_ANIMATION_CAPABILITY]);
    this.httpService.registerCommandHandler(this);
    this.logger.log(
      `Motor Automation 已注册: topic=${TOPIC_MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP}`,
    );
  }

  canHandle(topic: string): boolean {
    return topic === TOPIC_MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP;
  }

  async handleCommand(
    message: BusMessage,
  ): Promise<{ success: boolean; data?: any; msg?: string }> {
    if (message.topic !== TOPIC_MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP) {
      return { success: false, msg: `Motor Animation 无法处理 topic: ${message.topic}` };
    }

    const payload = this.ensureObject(message.payload);
    const text = typeof payload.text === 'string' ? payload.text : '';
    const result = await this.automationService.inputTextToFocusedApp(text);

    if (!result.success) {
      return { success: false, msg: result.message ?? 'input text failed' };
    }

    return {
      success: true,
      data: result,
    };
  }

  private ensureObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }
}
