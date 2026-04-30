import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// 类型安全的数字转换函数
const toNumber = ({ value }: { value: any }): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) throw new Error(`Cannot convert "${value}" to number`);
    return parsed;
  }
  throw new Error(`Cannot convert ${typeof value} to number`);
};
// ========== 集合管理 DTOs ==========
export class CreateAutomationSetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  platform?: number = 0;
}

export class UpdateAutomationSetDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  platform?: number;
}

export class DeleteAutomationSetDto {
  @Transform(toNumber)
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  id: number;
}

export class WorkAutomationDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  id: number;
}

// ========== 操作管理 DTOs ==========
export class GetActionsDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  setId: number;
}

export class ExportAutomationDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  setId: number;
}

export class ActionDataDto {
  // 坐标操作
  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  x?: number;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  y?: number;

  @IsString()
  @IsOptional()
  clickType?: string;

  // 按钮操作
  @IsString()
  @IsOptional()
  buttonType?: string;

  @IsString()
  @IsOptional()
  keyCombination?: string;

  // 滚动操作
  @IsString()
  @IsOptional()
  direction?: string;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  distance?: number;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  duration?: number;
}

export class ActionItemDto {
  @IsString()
  @IsIn(['coordinate', 'button', 'scroll'])
  actionType: 'coordinate' | 'button' | 'scroll';

  @Type(() => ActionDataDto)
  actionData: ActionDataDto;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  waitTime?: number;

  @IsString()
  @IsOptional()
  label?: string;
}

export class MarkerCoordinateDto {
  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  order?: number;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  x?: number;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  y?: number;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  physicalX?: number;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  physicalY?: number;

  @IsString()
  @IsOptional()
  type?: string;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  waitTime?: number;

  @IsString()
  @IsOptional()
  buttonType?: string;

  @IsString()
  @IsOptional()
  keyCombination?: string;
}

export class MarkerPageDto {
  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  pageIndex?: number;

  @IsString()
  @IsOptional()
  pageName?: string;

  @IsString()
  @IsOptional()
  imagePath?: string;

  @IsArray()
  @Type(() => MarkerCoordinateDto)
  coordinates: MarkerCoordinateDto[];
}

export class SaveMarkerCoordinatesDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @IsArray()
  @Type(() => MarkerPageDto)
  pages: MarkerPageDto[];
}

export class InsertActionsDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  setId: number;

  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  index: number;

  @IsArray()
  @Type(() => ActionItemDto)
  list: ActionItemDto[];
}

export class DeleteActionsDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  setId: number;

  @IsArray()
  @IsNumber({}, { each: true })
  indexList: number[];
}

export class UpdateActionDto {
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  actionId: number;

  @IsString()
  @IsIn(['coordinate', 'button', 'scroll'])
  actionType: 'coordinate' | 'button' | 'scroll';

  @Type(() => ActionDataDto)
  data: ActionDataDto & {
    waitTime?: number;
    label?: string;
  };
}

// ========== 导入导出 DTOs ==========
export class ImportAutomationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  config: any;
}

// ========== 查询参数 DTOs ==========
export class AutomationListQueryDto {
  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @Transform(toNumber)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  size?: number = 10;

  @IsString()
  @IsOptional()
  name?: string;
}

export class OptionsQueryDto {
  @IsString()
  @IsOptional()
  @IsIn(['action-types', 'button-types', 'scroll-directions'])
  type?: string;
}

export class InputTextDto {
  @IsString()
  @IsOptional()
  text: string;
}
