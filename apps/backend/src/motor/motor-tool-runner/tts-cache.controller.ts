/**
 * Motor Tool Runner — TTS 音频缓存静态路由
 *
 * 将 ~/.ai_secretary/tts_cache/<pluginId>/<file> 以 GET /tts-cache/:pluginId/:file
 * 暴露给 Body（Electron 渲染进程）播放与口型同步。插件负责落盘与生命周期（缓存自管），
 * 宿主只提供可访问性；CORS 由 main.ts 全局 enableCors() 覆盖。
 *
 * 安全：pluginId 与 file 仅允许纯文件名字符；边界检查基于 realpath 解析后的
 * 真实路径（防符号链接逃逸：缓存内文件若指向缓存外，解析后不在根内即拒绝）。
 */
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const MIME_BY_EXT: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
  '.json': 'application/json',
};

/** 仅允许字母/数字/下划线/连字符/点，且不得含路径分隔或 .. */
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * 解析缓存内文件的真实路径，越界（含符号链接逃逸）返回 null。
 * 抽为独立函数便于单测。
 */
export function resolveCacheFile(
  cacheRoot: string,
  pluginId: string,
  file: string,
): string | null {
  if (!SAFE_NAME.test(pluginId) || !SAFE_NAME.test(file) || file.startsWith('.')) {
    return null;
  }
  const candidate = path.join(cacheRoot, pluginId, file);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return null;
  }
  // realpath 解析符号链接后的真实位置，再做边界判断
  let realFile: string;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    return null;
  }
  // 缓存根本身可能也是符号链接（如用户把 tts_cache 软链到别处），同样取真实路径
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(fs.existsSync(cacheRoot) ? cacheRoot : path.dirname(cacheRoot));
  } catch {
    realRoot = path.resolve(cacheRoot);
  }
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    return null;
  }
  return realFile;
}

@Controller('tts-cache')
export class TtsCacheController {
  private readonly cacheRoot: string;

  constructor() {
    this.cacheRoot =
      process.env.TTS_CACHE_DIR ?? path.join(os.homedir(), '.ai_secretary', 'tts_cache');
  }

  @Get(':pluginId/:file')
  serve(
    @Param('pluginId') pluginId: string,
    @Param('file') file: string,
    @Res() res: Response,
  ): void {
    const resolved = resolveCacheFile(this.cacheRoot, pluginId, file);
    if (!resolved) {
      throw new NotFoundException('资源不存在');
    }

    res.setHeader('Content-Type', MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    // 同参数合成结果由插件按内容寻址/去重，浏览器侧可放心缓存
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(resolved).pipe(res);
  }
}
