/**
 * @human/cmux-tools — 默认工具配置
 *
 * 单一真相源：从包内的静态文件 config/cmux.json 读取。
 * backend 启动时（ToolConfigService.createSampleTools）会把这个配置
 * 复制到用户磁盘 ~/.ai_secretary/tools/tools/cmux.json。
 *
 * 修改工具配置只需改 config/cmux.json，无需动本文件。
 */
import * as fs from 'fs';
import * as path from 'path';

/** config/cmux.json 的绝对路径（从编译后的 dist/default-config.js 向上找） */
const CONFIG_FILE = path.resolve(__dirname, '..', 'config', 'cmux.json');

/**
 * 读取并解析包内的默认工具配置。
 *
 * 优先返回缓存（模块级），避免重复读盘。
 * 若文件缺失（包损坏/未正确发布），抛错 —— 调用方应捕获并记日志。
 */
export function loadDefaultConfig(): Record<string, unknown> {
  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * @deprecated 历史导出，等价于 loadDefaultConfig() 的结果。
 * 新代码应直接调 loadDefaultConfig()。
 */
export const CMUX_DEFAULT_CONFIG = loadDefaultConfig();

/** 配置文件在包内的路径（供 backend 直接 require.resolve 或 fs 读取） */
export const CONFIG_FILE_PATH = CONFIG_FILE;
