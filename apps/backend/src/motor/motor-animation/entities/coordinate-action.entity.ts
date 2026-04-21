import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('coordinate_actions')
export class CoordinateAction extends BaseEntity {
  @Column({
    name: 'set_id',
    type: 'bigint',
    unsigned: true,
    comment: '所属自动化集合ID',
  })
  setId: number;

  @Column({ name: 'step_index', type: 'int', comment: '步骤索引(执行顺序)' })
  stepIndex: number;

  @Column({ name: 'x', type: 'int', comment: 'X坐标' })
  x: number;

  @Column({ name: 'y', type: 'int', comment: 'Y坐标' })
  y: number;

  @Column({
    name: 'action_type',
    type: 'varchar',
    length: 50,
    default: 'click',
    comment: '操作类型(click/doubleClick/longPress/rightClick等)',
  })
  actionType: string;

  @Column({
    name: 'wait_time',
    type: 'int',
    default: 0,
    comment: '执行后等待时间(毫秒)',
  })
  waitTime: number;

  @Column({
    name: 'label',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '操作标签',
  })
  label: string;

  @Column({
    name: 'screenshot_path',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '截图路径',
  })
  screenshotPath: string;

  @Column({
    name: 'extra_data',
    type: 'json',
    nullable: true,
    comment: '扩展数据(JSON格式)',
  })
  extraData: any;
}
