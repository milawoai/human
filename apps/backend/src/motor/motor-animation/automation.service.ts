import {
  AutomationListQueryDto,
  CreateAutomationSetDto,
  DeleteActionsDto,
  DeleteAutomationSetDto,
  ImportAutomationDto,
  InsertActionsDto,
  OptionsQueryDto,
  SaveMarkerCoordinatesDto,
  UpdateActionDto,
  UpdateAutomationSetDto,
  WorkAutomationDto,
} from './automation.dto';
import {
  AutomationSet,
  ButtonAction,
  CoordinateAction,
  ScrollAction,
} from './entities';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Button,
  Key,
  Point,
  keyboard,
  mouse,
  sleep,
  straightTo,
} from '@nut-tree-fork/nut-js';
import { exec } from 'child_process';
import { Not, Repository } from 'typeorm';
import { promisify } from 'util';
const execAsync = promisify(exec);
@Injectable()
export class AutomationService {
  constructor(
    @InjectRepository(AutomationSet)
    private readonly automationSetRepository: Repository<AutomationSet>,
    @InjectRepository(CoordinateAction)
    private readonly coordinateActionRepository: Repository<CoordinateAction>,
    @InjectRepository(ButtonAction)
    private readonly buttonActionRepository: Repository<ButtonAction>,
    @InjectRepository(ScrollAction)
    private readonly scrollActionRepository: Repository<ScrollAction>,
  ) { }

  // ========== 文本输入 ==========

  /**
   * 将文本输入到当前焦点窗口
   * 使用剪贴板复制 + Cmd+V 粘贴的方式
   */
  async inputTextToFocusedApp(
    text: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (!text || text.trim() === '') {
      return { success: false, message: 'Text is empty' };
    }

    try {
      // 1. 设置剪贴板 (macOS pbcopy)
      // 处理特殊字符，防止 shell 注入
      const sanitizedText = text.replace(/[`$"\\]/g, '\\$&');
      await execAsync(`printf '%s' "${sanitizedText}" | pbcopy`);

      // 等待剪贴板设置完成
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 2. 模拟 Cmd+V 粘贴
      await keyboard.pressKey(Key.LeftCmd);
      await keyboard.pressKey(Key.V);
      await keyboard.releaseKey(Key.V);
      await keyboard.releaseKey(Key.LeftCmd);

      return { success: true };
    } catch (error) {
      console.error('[AutomationService] inputTextToFocusedApp failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ========== 集合管理 ==========
  async getAutomationSets(query: AutomationListQueryDto) {
    const { page = 1, size = 10, name } = query;
    const queryBuilder = this.automationSetRepository
      .createQueryBuilder('set')
      .where('set.isDelete = 0');

    if (name) {
      queryBuilder.andWhere('set.name LIKE :name', { name: `%${name}%` });
    }

    const [data, total] = await queryBuilder
      .orderBy('set.createdAt', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return { data, total };
  }

  async createAutomationSet(dto: CreateAutomationSetDto) {
    // 检查是否存在同名的集合（排除已删除的）
    const existingSet = await this.automationSetRepository.findOne({
      where: {
        name: dto.name,
        isDelete: 0,
      },
    });

    if (existingSet) {
      throw new Error(`集合名称 "${dto.name}" 已存在，请使用其他名称`);
    }

    const set = this.automationSetRepository.create(dto);
    return await this.automationSetRepository.save(set);
  }

  async updateAutomationSet(dto: UpdateAutomationSetDto) {
    const { id, ...updateData } = dto;

    // 如果要更新名称，需要检查是否与其他集合重名
    if (updateData.name) {
      const existingSet = await this.automationSetRepository.findOne({
        where: {
          name: updateData.name,
          isDelete: 0,
          id: Not(id), // 排除当前要更新的集合
        },
      });

      if (existingSet) {
        throw new Error(`集合名称 "${updateData.name}" 已存在，请使用其他名称`);
      }
    }

    await this.automationSetRepository.update(id, updateData);
    return await this.automationSetRepository.findOne({ where: { id } });
  }

  async deleteAutomationSet(dto: DeleteAutomationSetDto) {
    const { id } = dto;

    // 软删除集合
    await this.automationSetRepository.update(id, { isDelete: 1 });

    // 软删除所有相关操作并将 stepIndex 设为 -1
    await this.coordinateActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId', { setId: id })
      .execute();

    await this.buttonActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId', { setId: id })
      .execute();

    await this.scrollActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId', { setId: id })
      .execute();

    return { success: true };
  }

  // ========== 操作管理 ==========
  async getActions(setId: number) {
    const [coordinateActions, buttonActions, scrollActions] = await Promise.all(
      [
        this.coordinateActionRepository.find({
          where: { setId, isDelete: 0 },
          order: { stepIndex: 'ASC' },
        }),
        this.buttonActionRepository.find({
          where: { setId, isDelete: 0 },
          order: { stepIndex: 'ASC' },
        }),
        this.scrollActionRepository.find({
          where: { setId, isDelete: 0 },
          order: { stepIndex: 'ASC' },
        }),
      ],
    );

    // 合并所有操作并按 stepIndex 排序
    const allActions = [
      ...coordinateActions.map((action) => ({ ...action, type: 'coordinate' })),
      ...buttonActions.map((action) => ({ ...action, type: 'button' })),
      ...scrollActions.map((action) => ({ ...action, type: 'scroll' })),
    ].sort((a, b) => a.stepIndex - b.stepIndex);

    return allActions;
  }

  async insertActions(dto: InsertActionsDto) {
    const { setId, index, list } = dto;

    // 1. 更新现有操作的 stepIndex
    await this.updateStepIndexes(setId, index, list.length);

    // 2. 插入新操作
    for (let i = 0; i < list.length; i++) {
      const action = list[i];
      const stepIndex = index + i;

      await this.createAction(setId, stepIndex, action);
    }

    return { success: true };
  }

  async deleteActions(dto: DeleteActionsDto) {
    const { setId, indexList } = dto;

    // 按倒序删除，避免位置变化影响
    const sortedIndexes = indexList.sort((a, b) => b - a);

    for (const index of sortedIndexes) {
      // 软删除指定位置的操作，stepIndex 设为 -1
      await this.softDeleteActionByIndex(setId, index);
    }

    // 重新整理 stepIndex
    await this.reorderStepIndexes(setId);

    return { success: true };
  }

  async updateAction(dto: UpdateActionDto) {
    const { actionId, actionType, data } = dto;

    const repository = this.getRepositoryByType(actionType);
    await repository.update(actionId, data);

    return await repository.findOne({ where: { id: actionId } });
  }

  // ========== 导入导出 ==========
  async exportAutomation(setId: number) {
    const set = await this.automationSetRepository.findOne({
      where: { id: setId },
    });
    const actions = await this.getActions(setId);

    return {
      name: set?.name,
      description: set?.description,
      actions: actions.map((action) => ({
        type: action.type,
        stepIndex: action.stepIndex,
        data: this.extractActionData(action),
        waitTime: action.waitTime,
        label: action.label,
      })),
    };
  }

  async importAutomation(dto: ImportAutomationDto) {
    const { name, config } = dto;

    // 创建集合
    const set = await this.createAutomationSet({
      name,
      description: config.description,
    });

    // 导入操作
    if (config.actions && config.actions.length > 0) {
      await this.insertActions({
        setId: set.id,
        index: 0,
        list: config.actions,
      });
    }

    return set;
  }

  async saveMarkerCoordinates(dto: SaveMarkerCoordinatesDto) {
    const { id: setId, pages } = dto;

    const automationSet = await this.automationSetRepository.findOne({
      where: { id: setId, isDelete: 0 },
    });

    if (!automationSet) {
      throw new NotFoundException(`未找到 ID 为 ${setId} 的自动化集合`);
    }

    // 软删除所有现有的操作
    await this.coordinateActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId AND isDelete = 0', { setId })
      .execute();

    await this.buttonActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId AND isDelete = 0', { setId })
      .execute();

    const flattened = pages
      .flatMap((page, pageIdx) => {
        const pageOrder = page.pageIndex ?? pageIdx + 1;
        const pageName = page.pageName;
        const screenshotPath = page.imagePath || '';
        return (page.coordinates || []).map((coordinate, coordIdx) => {
          const order = coordinate.order ?? coordIdx + 1;
          const actionCategory = this.resolveActionCategory(coordinate.type);

          // 对于按钮类型，不需要有效坐标
          if (actionCategory === 'button') {
            return {
              pageIndex: pageOrder,
              pageName,
              order,
              x: coordinate.x,
              y: coordinate.y,
              physicalX: coordinate.physicalX,
              physicalY: coordinate.physicalY,
              actionCategory,
              actionType: coordinate.type || 'button',
              waitTime: coordinate.waitTime ?? 100,
              screenshotPath,
              buttonType: coordinate.buttonType,
              keyCombination: coordinate.keyCombination || '',
            };
          }

          // 对于坐标类型，需要有效坐标
          const x = coordinate.x;
          const y = coordinate.y;

          if (typeof x !== 'number' || typeof y !== 'number') {
            return null;
          }

          return {
            pageIndex: pageOrder,
            pageName,
            order,
            x,
            y,
            physicalX: coordinate.physicalX,
            physicalY: coordinate.physicalY,
            actionCategory,
            actionType: coordinate.type || 'click',
            waitTime: coordinate.waitTime ?? 100,
            screenshotPath,
          };
        });
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    flattened.sort((a, b) => {
      if (a.pageIndex !== b.pageIndex) {
        return a.pageIndex - b.pageIndex;
      }
      return a.order - b.order;
    });

    // 分离坐标操作和按钮操作
    const coordinateItems = flattened.filter(
      (item) => item.actionCategory === 'coordinate',
    );
    const buttonItems = flattened.filter(
      (item) => item.actionCategory === 'button',
    );

    let savedCount = 0;

    // 保存坐标操作
    if (coordinateItems.length > 0) {
      const coordinateEntities = coordinateItems.map((item) =>
        this.coordinateActionRepository.create({
          setId,
          stepIndex: flattened.findIndex((f) => f === item),
          x: item.x,
          y: item.y,
          actionType: item.actionType,
          waitTime: item.waitTime,
          label: item.pageName ? `${item.pageName}#${item.order}` : '',
          screenshotPath: item.screenshotPath,
          extraData: {
            pageIndex: item.pageIndex,
            pageName: item.pageName,
            physicalX: item.physicalX,
            physicalY: item.physicalY,
          },
        }),
      );

      await this.coordinateActionRepository.save(coordinateEntities);
      savedCount += coordinateEntities.length;
    }

    // 保存按钮操作
    if (buttonItems.length > 0) {
      const buttonEntities = buttonItems.map((item) =>
        this.buttonActionRepository.create({
          setId,
          stepIndex: flattened.findIndex((f) => f === item),
          buttonType: (item as any).buttonType || 'custom',
          keyCombination: (item as any).keyCombination || '',
          waitTime: item.waitTime,
          label: item.pageName ? `${item.pageName}#${item.order}` : '',
          screenshotPath: item.screenshotPath,
          extraData: {
            pageIndex: item.pageIndex,
            pageName: item.pageName,
          },
        }),
      );

      await this.buttonActionRepository.save(buttonEntities);
      savedCount += buttonEntities.length;
    }

    return { count: savedCount };
  }

  private resolveActionCategory(type?: string) {
    const coordinateTypes = new Set([
      'click',
      'doubleClick',
      'longPress',
      'rightClick',
      'coordinate',
      undefined,
    ]);

    if (type && ['button', 'scroll'].includes(type)) {
      return type as 'button' | 'scroll';
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return coordinateTypes.has(type as any) ? 'coordinate' : 'coordinate';
  }

  // ========== 配置选项 ==========
  getOptions(query: OptionsQueryDto) {
    const { type } = query;

    const options = {
      'action-types': ['coordinate', 'button', 'scroll'],
      'button-types': [
        'Enter',
        'Space',
        'Tab',
        'Escape',
        'Arrow',
        'Ctrl',
        'Alt',
        'Shift',
      ],
      'scroll-directions': ['up', 'down', 'left', 'right'],
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return type ? options[type] || [] : options;
  }

  // ========== 私有辅助方法 ==========
  private async updateStepIndexes(
    setId: number,
    fromIndex: number,
    increment: number,
  ) {
    // 更新所有大于等于 fromIndex 的操作
    await this.coordinateActionRepository
      .createQueryBuilder()
      .update()
      .set({ stepIndex: () => `step_index + ${increment}` })
      .where('setId = :setId AND stepIndex >= :fromIndex AND isDelete = 0', {
        setId,
        fromIndex,
      })
      .execute();

    await this.buttonActionRepository
      .createQueryBuilder()
      .update()
      .set({ stepIndex: () => `step_index + ${increment}` })
      .where('setId = :setId AND stepIndex >= :fromIndex AND isDelete = 0', {
        setId,
        fromIndex,
      })
      .execute();

    await this.scrollActionRepository
      .createQueryBuilder()
      .update()
      .set({ stepIndex: () => `step_index + ${increment}` })
      .where('setId = :setId AND stepIndex >= :fromIndex AND isDelete = 0', {
        setId,
        fromIndex,
      })
      .execute();
  }

  private async createAction(setId: number, stepIndex: number, action: any) {
    const { actionType, actionData, waitTime = 0, label = '' } = action;

    switch (actionType) {
      case 'coordinate': {
        const coordinateAction = this.coordinateActionRepository.create({
          setId,
          stepIndex,
          x: actionData.x,
          y: actionData.y,
          actionType: actionData.clickType || 'click',
          waitTime,
          label,
        });
        await this.coordinateActionRepository.save(coordinateAction);
        break;
      }

      case 'button': {
        const buttonAction = this.buttonActionRepository.create({
          setId,
          stepIndex,
          buttonType: actionData.buttonType,
          keyCombination: actionData.keyCombination || '',
          waitTime,
          label,
        });
        await this.buttonActionRepository.save(buttonAction);
        break;
      }

      case 'scroll': {
        const scrollAction = this.scrollActionRepository.create({
          setId,
          stepIndex,
          direction: actionData.direction,
          distance: actionData.distance || 0,
          duration: actionData.duration || 0,
          waitTime,
          label,
        });
        await this.scrollActionRepository.save(scrollAction);
        break;
      }
    }
  }

  private async softDeleteActionByIndex(setId: number, index: number) {
    await this.coordinateActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId AND stepIndex = :index AND isDelete = 0', {
        setId,
        index,
      })
      .execute();

    await this.buttonActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId AND stepIndex = :index AND isDelete = 0', {
        setId,
        index,
      })
      .execute();

    await this.scrollActionRepository
      .createQueryBuilder()
      .update()
      .set({ isDelete: 1, stepIndex: -1 })
      .where('setId = :setId AND stepIndex = :index AND isDelete = 0', {
        setId,
        index,
      })
      .execute();
  }

  private async reorderStepIndexes(setId: number) {
    const actions = await this.getActions(setId);

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const repository = this.getRepositoryByType(action.type);
      await repository.update(action.id, { stepIndex: i });
    }
  }

  private getRepositoryByType(actionType: string) {
    switch (actionType) {
      case 'coordinate':
        return this.coordinateActionRepository;
      case 'button':
        return this.buttonActionRepository;
      case 'scroll':
        return this.scrollActionRepository;
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private extractActionData(action: any) {
    switch (action.type) {
      case 'coordinate':
        return {
          x: action.x,
          y: action.y,
          clickType: action.actionType,
        };
      case 'button':
        return {
          buttonType: action.buttonType,
          keyCombination: action.keyCombination,
        };
      case 'scroll':
        return {
          direction: action.direction,
          distance: action.distance,
          duration: action.duration,
        };
      default:
        return {};
    }
  }

  async autoMate(query: WorkAutomationDto) {
    const { id } = query;

    const automationSet = await this.automationSetRepository.findOne({
      where: { id, isDelete: 0 },
    });

    if (!automationSet) {
      throw new NotFoundException(`未找到 ID 为 ${id} 的自动化集合`);
    }

    // 获取所有操作并按步骤索引排序
    const allActions = await this.getActions(id);

    if (allActions.length === 0) {
      return {
        success: false,
        message: '该自动化集合没有可执行的操作',
      };
    }

    // 按顺序执行所有操作
    for (const action of allActions) {
      switch (action.type) {
        case 'coordinate':
          await this.executeCoordinateAction(action as CoordinateAction);
          break;
        case 'button':
          await this.executeButtonAction(action as ButtonAction);
          break;
        case 'scroll':
          // TODO: 实现滚动操作
          console.log('滚动操作暂未实现');
          break;
        default:
          console.warn(`未知操作类型: ${action.type}`);
      }
    }

    return {
      success: true,
      data: {
        setId: id,
        executedCount: allActions.length,
      },
    };
  }

  private async executeCoordinateAction(action: CoordinateAction) {
    const { x, y, actionType, waitTime } = action;

    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('坐标操作缺少有效的坐标值');
    }

    await mouse.move(straightTo(new Point(x, y)));

    const normalizedType = (actionType || 'click').toLowerCase();

    switch (normalizedType) {
      case 'doubleclick':
      case 'double_click':
        await mouse.doubleClick(Button.LEFT);
        break;
      case 'rightclick':
      case 'right_click':
        await mouse.click(Button.RIGHT);
        break;
      case 'longpress':
      case 'long_press': {
        await mouse.pressButton(Button.LEFT);
        await sleep(this.getLongPressDuration(action));
        await mouse.releaseButton(Button.LEFT);
        break;
      }
      default:
        await mouse.click(Button.LEFT);
        break;
    }

    const waitAfterAction = typeof waitTime === 'number' ? waitTime : 0;
    if (waitAfterAction > 0) {
      await sleep(waitAfterAction);
    }
  }

  private async executeButtonAction(action: ButtonAction) {
    const { keyCombination, waitTime } = action;

    if (keyCombination && keyCombination.trim()) {
      const keyCombo = keyCombination.trim();
      if (keyCombo.includes('+')) {
        await this.executeKeyCombination(keyCombo);
      } else {
        // 单键处理
        await this.executeSingleKey(keyCombo);
      }
    }

    const waitAfterAction = typeof waitTime === 'number' ? waitTime : 0;
    if (waitAfterAction > 0) {
      await sleep(waitAfterAction);
    }
  }

  private async executeKeyCombination(combination: string) {
    // 解析组合键，如 "Cmd+V", "Ctrl+C", "Alt+Tab"
    const keys = combination.split('+').map((key) => key.trim());

    if (keys.length === 1) {
      // 单键
      await this.executeSingleKey(keys[0]);
      return;
    }

    // 组合键处理
    const modifierKeys = keys.slice(0, -1); // 修饰键
    const mainKey = keys[keys.length - 1]; // 主键

    try {
      // 按下修饰键
      for (const modifier of modifierKeys) {
        const nutKey = this.mapKeyToNutJs(modifier);
        if (nutKey) {
          await keyboard.pressKey(nutKey);
        }
      }

      // 按下主键
      const nutMainKey = this.mapKeyToNutJs(mainKey);
      if (nutMainKey) {
        await keyboard.pressKey(nutMainKey);
        await keyboard.releaseKey(nutMainKey);
      } else {
        // 如果是字符，直接输入
        await keyboard.type(mainKey);
      }

      // 释放修饰键（逆序）
      for (let i = modifierKeys.length - 1; i >= 0; i--) {
        const nutKey = this.mapKeyToNutJs(modifierKeys[i]);
        if (nutKey) {
          await keyboard.releaseKey(nutKey);
        }
      }
    } catch (error) {
      console.error(`执行组合键 ${combination} 时出错:`, error);
    }
  }

  private async executeSingleKey(keyName: string) {
    const nutKey = this.mapKeyToNutJs(keyName);
    if (nutKey) {
      await keyboard.pressKey(nutKey);
      await keyboard.releaseKey(nutKey);
    } else {
      // 如果是字符，直接输入
      await keyboard.type(keyName);
    }
  }

  private mapKeyToNutJs(
    keyName: string,
  ): (typeof Key)[keyof typeof Key] | null {
    const keyMap: { [key: string]: (typeof Key)[keyof typeof Key] } = {
      // 修饰键
      Cmd: Key.LeftCmd,
      Command: Key.LeftCmd,
      Ctrl: Key.LeftControl,
      Control: Key.LeftControl,
      Alt: Key.LeftAlt,
      Option: Key.LeftAlt,
      Shift: Key.LeftShift,

      // 功能键
      Enter: Key.Return,
      Return: Key.Return,
      Space: Key.Space,
      Tab: Key.Tab,
      Escape: Key.Escape,
      Esc: Key.Escape,
      Backspace: Key.Backspace,
      Delete: Key.Delete,

      // 方向键
      Up: Key.Up,
      Down: Key.Down,
      Left: Key.Left,
      Right: Key.Right,

      // 字母
      A: Key.A,
      B: Key.B,
      C: Key.C,
      D: Key.D,
      E: Key.E,
      F: Key.F,
      G: Key.G,
      H: Key.H,
      I: Key.I,
      J: Key.J,
      K: Key.K,
      L: Key.L,
      M: Key.M,
      N: Key.N,
      O: Key.O,
      P: Key.P,
      Q: Key.Q,
      R: Key.R,
      S: Key.S,
      T: Key.T,
      U: Key.U,
      V: Key.V,
      W: Key.W,
      X: Key.X,
      Y: Key.Y,
      Z: Key.Z,

      // 数字
      '0': Key.Num0,
      '1': Key.Num1,
      '2': Key.Num2,
      '3': Key.Num3,
      '4': Key.Num4,
      '5': Key.Num5,
      '6': Key.Num6,
      '7': Key.Num7,
      '8': Key.Num8,
      '9': Key.Num9,

      // F键
      F1: Key.F1,
      F2: Key.F2,
      F3: Key.F3,
      F4: Key.F4,
      F5: Key.F5,
      F6: Key.F6,
      F7: Key.F7,
      F8: Key.F8,
      F9: Key.F9,
      F10: Key.F10,
      F11: Key.F11,
      F12: Key.F12,
    };

    return keyMap[keyName] || null;
  }

  private getLongPressDuration(action: CoordinateAction) {
    const DEFAULT_LONG_PRESS_MS = 500;
    const candidate = action.extraData?.longPressDuration;
    if (typeof candidate === 'number' && candidate > 0) {
      return candidate;
    }
    return DEFAULT_LONG_PRESS_MS;
  }
}
