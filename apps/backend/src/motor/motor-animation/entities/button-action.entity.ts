import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('button_actions')
export class ButtonAction extends BaseEntity {
  @Column({
    name: 'set_id',
    comment: '所属自动化集合ID',
  })
  setId: number;

  @Column({ name: 'step_index', type: 'integer', comment: '步骤索引(执行顺序)' })
  stepIndex: number;

  @Column({
    name: 'button_type',
    type: 'text',
    comment: '按钮类型(Enter/Space/Escape/Tab/Arrow等)',
  })
  buttonType: string;

  @Column({
    name: 'key_combination',
    type: 'text',
    default: '',
    comment: '组合键(Ctrl+C/Alt+Tab等)',
  })
  keyCombination: string;

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
