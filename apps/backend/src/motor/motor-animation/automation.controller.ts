import {
  AutomationListQueryDto,
  CreateAutomationSetDto,
  DeleteActionsDto,
  DeleteAutomationSetDto,
  ImportAutomationDto,
  InputTextDto,
  InsertActionsDto,
  OptionsQueryDto,
  SaveMarkerCoordinatesDto,
  UpdateActionDto,
  UpdateAutomationSetDto,
  WorkAutomationDto,
} from './automation.dto';
import { AutomationService } from './automation.service';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) { }

  // ========== 文本输入接口 ==========

  /**
   * 将文本输入到当前焦点窗口（通过剪贴板+粘贴）
   */
  @Post('input-text')
  async inputText(@Body() dto: InputTextDto) {
    return await this.automationService.inputTextToFocusedApp(dto.text);
  }

  // ========== 集合管理接口 ==========

  /**
   * 获取自动化集合列表
   */
  @Get('sets/list')
  async getAutomationSets(@Query() query: AutomationListQueryDto) {
    return await this.automationService.getAutomationSets(query);
  }

  /**
   * 创建自动化集合
   */
  @Post('sets/create')
  async createAutomationSet(@Body() dto: CreateAutomationSetDto) {
    const result = await this.automationService.createAutomationSet(dto);
    return result;
  }

  /**
   * 更新自动化集合
   */
  @Post('sets/update')
  async updateAutomationSet(@Body() dto: UpdateAutomationSetDto) {
    return await this.automationService.updateAutomationSet(dto);
  }

  /**
   * 删除自动化集合（软删除）
   */
  @Post('sets/delete')
  async deleteAutomationSet(@Body() dto: DeleteAutomationSetDto) {
    return await this.automationService.deleteAutomationSet(dto);
  }

  // ========== 操作管理接口 ==========

  /**
   * 获取集合的所有操作
   */
  @Get('actions/:setId')
  async getActions(@Param('setId') setId: number) {
    return await this.automationService.getActions(setId);
  }

  /**
   * 插入操作到指定位置
   */
  @Post('actions/insert')
  async insertActions(@Body() dto: InsertActionsDto) {
    return await this.automationService.insertActions(dto);
  }

  /**
   * 根据标记窗口保存坐标
   */
  @Post('actions/marker/save')
  async saveMarkerCoordinates(@Body() dto: SaveMarkerCoordinatesDto) {
    return await this.automationService.saveMarkerCoordinates(dto);
  }

  /**
   * 删除指定位置的操作（软删除，stepIndex设为-1）
   */
  @Post('actions/delete')
  async deleteActions(@Body() dto: DeleteActionsDto) {
    return await this.automationService.deleteActions(dto);
  }

  /**
   * 修改指定操作
   */
  @Post('actions/update')
  async updateAction(@Body() dto: UpdateActionDto) {
    return await this.automationService.updateAction(dto);
  }

  // ========== 导入导出接口 ==========

  /**
   * 导出自动化配置为JSON
   */
  @Get('export/:setId')
  async exportAutomation(@Param('setId') setId: number) {
    return await this.automationService.exportAutomation(setId);
  }

  /**
   * 导入JSON配置创建自动化
   */
  @Post('import')
  async importAutomation(@Body() dto: ImportAutomationDto) {
    return await this.automationService.importAutomation(dto);
  }

  // ========== 配置选项接口 ==========

  /**
   * 获取配置选项
   */
  @Get('options')
  async getOptions(@Query() query: OptionsQueryDto) {
    return await this.automationService.getOptions(query);
  }

  @Get('auto-mate')
  async autoMate(@Query() query: WorkAutomationDto) {
    return await this.automationService.autoMate(query);
  }
}
