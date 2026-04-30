import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('coordinate_actions')
export class CoordinateAction extends BaseEntity {
  @Column({
    name: 'set_id',
    comment: '所属自动化集合ID',
  })
  setId: number;

  @Column({ name: 'step_index', type: 'integer', comment: '步骤索引(执行顺序)' })
  stepIndex: number;

  @Column({ name: 'x', type: 'integer', comment: 'X坐标' })
  x: number;

  @Column({ name: 'y', type: 'integer', comment: 'Y坐标' })
  y: number;

  @Column({
    name: 'action_type',
    type: 'text',
    default: 'click',
    comment: '操作类型(click/doubleClick/longPress/rightClick等)',
  })
  actionType: string;

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
