/**
 * Motor Tool Runner — TTS 音频缓存静态路由
 *
 * 将 ~/.ai_secretary/tts_cache/<pluginId>/<file> 以 GET /tts-cache/:pluginId/:file
 * 暴露给 Body（Electron 渲染进程）播放与口型同步。插件负责落盘与生命周期（缓存自管），
 * 宿主只提供可访问性；CORS 由 main.ts 全局 enableCors() 覆盖。
 *
 * 安全：pluginId 与 file 仅允许纯文件名字符（禁目录穿越），路径必须落在缓存根内。
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
    if (!SAFE_NAME.test(pluginId) || !SAFE_NAME.test(file) || file.startsWith('.')) {
      throw new NotFoundException('资源不存在');
    }

    const filePath = path.join(this.cacheRoot, pluginId, file);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(this.cacheRoot) + path.sep)) {
      throw new NotFoundException('资源不存在');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new NotFoundException('资源不存在');
    }

    res.setHeader('Content-Type', MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    // 同参数合成结果由插件按内容寻址/去重，浏览器侧可放心缓存
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(resolved).pipe(res);
  }
}
