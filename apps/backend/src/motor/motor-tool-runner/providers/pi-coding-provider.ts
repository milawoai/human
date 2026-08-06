/**
 * PiCodingProvider — 为 pi-coding-agent 工具提供包装
 */
import { Logger, Injectable } from '@nestjs/common';
import {
  BuiltinToolProvider,
  ToolInstance,
  ToolDescriptor,
  ToolResult,
  ToolStatus,
} from '../core/tool-descriptor';
import { ToolContext } from '../core/tool-context';

const PI_CODING_AGENT_MODULE = '@earendil-works/pi-coding-agent';

const dynamicImport = <T = unknown>(specifier: string): Promise<T> =>
  new Function('specifier', 'return import(specifier)')(specifier);

@Injectable()
export class PiCodingProvider implements BuiltinToolProvider {
  readonly providerId = 'pi-coding-tools';

  createInstance(descriptor: ToolDescriptor): ToolInstance {
    return new PiCodingToolInstance(descriptor);
  }
}

class PiCodingToolInstance implements ToolInstance {
  private readonly logger = new Logger(PiCodingToolInstance.name);
  status: ToolStatus = 'ready';

  constructor(readonly descriptor: ToolDescriptor) {}

  async execute(
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    try {
      const codingAgent = await this.getPiCodingAgent();
      
      // 获取当前工作目录，优先从 context.metadata.cwd 获取，否则从 config 或 process.cwd()
      const cwd = (context.metadata?.cwd as string) || (this.descriptor.config.cwd as string) || process.cwd();
      
      this.logger.debug(`执行 PiCodingTool: capability=${capability}, cwd=${cwd}`);
      
      const tools = await codingAgent.createCodingTools(cwd);
      const tool = tools.find((t: any) => t.name === capability);

      if (!tool) {
        return {
          success: false,
          error: {
            code: 'CAPABILITY_NOT_FOUND',
            message: `PiCodingTool 未找到能力: ${capability}`,
          },
        };
      }

      // 注意：pi-coding-agent 的 execute 签名是 (toolCallId, params, signal, onUpdate)
      // Motor 的 AdapterToolContext 中包含了这些，这里进行强制类型转换
      const adapterContext = context as any;
      const result = await tool.execute(
        adapterContext.toolCallId || context.sessionId || Date.now().toString(),
        params,
        adapterContext.signal,
        adapterContext.onUpdate,
      );

      // 提取返回数据：优先使用 details，否则尝试从 content 提取
      let data = result.details;
      if (!data && result.content && result.content.length > 0) {
        data = result.content[0].text;
      }

      return {
        success: true,
        data: data ?? result,
      };
    } catch (error) {
      this.logger.error(`执行 PiCodingTool 失败: ${error}`);
      return {
        success: false,
        error: {
          code: 'PI_CODING_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async getPiCodingAgent(): Promise<any> {
    return dynamicImport(PI_CODING_AGENT_MODULE);
  }
}
