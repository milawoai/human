import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('automation_sets')
export class AutomationSet extends BaseEntity {
  @Column({
    name: 'name',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '自动化集合名称',
  })
  name: string;

  @Column({
    name: 'description',
    type: 'text',
    nullable: true,
    comment: '自动化集合描述',
  })
  description: string;

  @Column({
    name: 'platform',
    type: 'tinyint',
    default: 0,
    comment: '平台标识: 0=Mac, 1=Windows, 2=Linux',
  })
  platform: number;
}
