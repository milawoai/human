/**
 * SystemSessionProvider — 为系统会话工具提供包装
 */
import { Logger, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  BuiltinToolProvider,
  ToolInstance,
  ToolDescriptor,
  ToolResult,
  ToolStatus,
} from '../core/tool-descriptor';
import { ToolContext } from '../core/tool-context';

@Injectable()
export class SystemSessionProvider implements BuiltinToolProvider {
  readonly providerId = 'system-session-tools';

  constructor(@Optional() private readonly moduleRef?: ModuleRef) {}

  createInstance(descriptor: ToolDescriptor): ToolInstance {
    let sessionStore: any = null;
    if (this.moduleRef) {
      try {
        // 注意：由于循环依赖，我们通过字符串名称从容器中获取 AgentSessionStore
        sessionStore = this.moduleRef.get('AgentSessionStore', { strict: false });
      } catch (e) {
        // 忽略错误
      }
    }
    return new SystemSessionToolInstance(descriptor, sessionStore);
  }
}

class SystemSessionToolInstance implements ToolInstance {
  private readonly logger = new Logger(SystemSessionToolInstance.name);
  status: ToolStatus = 'ready';

  constructor(
    readonly descriptor: ToolDescriptor,
    private readonly sessionStore: any,
  ) {}

  async execute(
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    if (!this.sessionStore) {
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'AgentSessionStore 不可用',
        },
      };
    }

    switch (capability) {
      case 'get_session_meta': {
        try {
          const sessionId = (params.sessionId as string) || context.sessionId;
          const session = this.sessionStore.getSession(sessionId, {
            includeMessages: false,
          });
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Session not found: ${sessionId}` },
            };
          }
          return { success: true, data: session };
        } catch (error) {
          return {
            success: false,
            error: {
              code: 'SESSION_STORE_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }
      default:
        return {
          success: false,
          error: {
            code: 'CAPABILITY_NOT_FOUND',
            message: `SystemSessionTool 未找到能力: ${capability}`,
          },
        };
    }
  }
}
