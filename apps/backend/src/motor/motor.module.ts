import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationSet } from './motor-animation/entities/automation-set.entity';
import { ButtonAction } from './motor-animation/entities/button-action.entity';
import { CoordinateAction } from './motor-animation/entities/coordinate-action.entity';
import { ScrollAction } from './motor-animation/entities/scroll-action.entity';
import { AutomationController } from './motor-animation/automation.controller';
import { AutomationService } from './motor-animation/automation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationSet,
      ButtonAction,
      CoordinateAction,
      ScrollAction,
    ]),
  ],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class MotorModule {}
