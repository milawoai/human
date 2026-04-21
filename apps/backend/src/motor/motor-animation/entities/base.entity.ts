/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-08-12 14:43:19
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-08-13 14:13:00
 * @FilePath: /auto-coding-nest/src/entities/base.entity.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  // DeleteDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true, comment: '主键' })
  id: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
    comment: '创建时间',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
    comment: '更新时间',
  })
  updatedAt: Date;

  // @DeleteDateColumn({ name: 'delete_time', type: 'timestamp' })
  // deletedAt: Date;

  @Column({
    name: 'is_delete',
    type: 'tinyint',
    default: 0,
    comment: '逻辑删除 0 未删除， >1 已删除',
  })
  isDelete: number;
}
