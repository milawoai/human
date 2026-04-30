import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('scroll_actions')
export class ScrollAction extends BaseEntity {
  @Column({
    name: 'set_id',
    comment: '所属自动化集合ID',
  })
  setId: number;

  @Column({ name: 'step_index', type: 'integer', comment: '步骤索引(执行顺序)' })
  stepIndex: number;

  @Column({
    name: 'direction',
    type: 'text',
    comment: '滚动方向(up/down/left/right)',
  })
  direction: string;

  @Column({
    name: 'distance',
    type: 'integer',
    default: 0,
    comment: '滚动距离(像素)',
  })
  distance: number;

  @Column({
    name: 'duration',
    type: 'integer',
    default: 0,
    comment: '滚动持续时间(毫秒)',
  })
  duration: number;

  @Column({
    name: 'wait_time',
    type: 'integer',
    default: 0,
    comment: '执行后等待时间(毫秒)',
  })
  waitTime: number;

  @Column({
    name: 'label',
    type: 'text',
    default: '',
    comment: '操作标签',
  })
  label: string;

  @Column({
    name: 'screenshot_path',
    type: 'text',
    nullable: true,
    comment: '截图路径',
  })
  screenshotPath: string;

  @Column({
    name: 'extra_data',
    type: 'simple-json',
    nullable: true,
    comment: '扩展数据(JSON格式)',
  })
  extraData: any;
}
