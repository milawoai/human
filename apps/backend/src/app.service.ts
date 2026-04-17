import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): any {
    return { status: 'success', service: 'Human Nest Service', port: 12002 };
  }
}
