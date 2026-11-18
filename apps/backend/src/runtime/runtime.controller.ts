import { Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RuntimeService } from './runtime.service';
@Controller('runtime')
export class RuntimeController {
  constructor(private readonly runtime: RuntimeService) {}
  @Get('identity')
  identity() { return this.runtime.identity(); }
  @Post('shutdown')
  @HttpCode(202)
  shutdown(@Req() request: Request) {
    if (request.headers.origin || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') ||
        !this.runtime.authorize(request.headers['x-human-owner-token'])) throw new UnauthorizedException();
    setImmediate(() => { void this.runtime.shutdown().catch(() => { process.exitCode = 1; }); });
    return { accepted: true };
  }
}
