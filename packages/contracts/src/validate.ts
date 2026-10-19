/**
 * 类别契约 — 轻量 Schema 校验器
 *
 * 支持 tools/*.json 的简单字段格式（type/required/enum/min/max/...）。
 * 宿主在加载时校验入参声明、在调用时校验入参与出参；
 * 插件仓库可在自己的测试里用同一校验器提前对齐。
 */
import type {
  ContractFieldSchema,
  SchemaValidationResult,
} from './types';

/** 各 type 对应的 JS 判断 */
function isType(value: unknown, type: ContractFieldSchema['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * 校验一个对象是否符合字段 Schema。
 *
 * 宽松原则（与宿主存量工具兼容）：
 * - 只校验 Schema 中声明的字段，多余字段不报错
 * - 可选字段缺省不报错
 */
export function validateFields(
  value: unknown,
  schema: Record<string, ContractFieldSchema>,
  rootName = 'value',
): SchemaValidationResult {
  const errors: string[] = [];

  if (!schema || Object.keys(schema).length === 0) {
    // 无声明则不校验
    return { ok: true, errors };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: [`${rootName} 应为对象`] };
  }

  const obj = value as Record<string, unknown>;

  for (const [key, field] of Object.entries(schema)) {
    const label = `${rootName}.${key}`;
    const present = obj[key] !== undefined && obj[key] !== null;

    if (!present) {
      if (field.required) {
        errors.push(`缺少必填字段 ${label}`);
      }
      continue;
    }

    const v = obj[key];

    if (!isType(v, field.type)) {
      errors.push(`${label} 应为 ${field.type}，实际为 ${Array.isArray(v) ? 'array' : typeof v}`);
      continue;
    }

    if (field.enum && !field.enum.includes(v as string | number)) {
      errors.push(`${label} 取值 ${String(v)} 不在允许范围 [${field.enum.join(', ')}]`);
      continue;
    }

    if (field.type === 'string') {
      const s = v as string;
      if (field.minLength !== undefined && s.length < field.minLength) {
        errors.push(`${label} 长度不足 minLength=${field.minLength}`);
      }
      if (field.maxLength !== undefined && s.length > field.maxLength) {
        errors.push(`${label} 超长 maxLength=${field.maxLength}`);
      }
    }

    if (field.type === 'number') {
      const n = v as number;
      if (field.minimum !== undefined && n < field.minimum) {
        errors.push(`${label} 小于 minimum=${field.minimum}`);
      }
      if (field.maximum !== undefined && n > field.maximum) {
        errors.push(`${label} 大于 maximum=${field.maximum}`);
      }
    }

    if (field.type === 'array' && field.items) {
      const arr = v as unknown[];
      for (let i = 0; i < arr.length; i++) {
        if (!isType(arr[i], field.items.type)) {
          errors.push(`${label}[${i}] 应为 ${field.items.type}`);
          break;
        }
        // object 元素的字段校验（如 voices[].voiceId 必填非空）
        if (field.items.type === 'object' && field.items.fields) {
          const itemCheck = validateFields(arr[i], field.items.fields, `${label}[${i}]`);
          errors.push(...itemCheck.errors);
          if (!itemCheck.ok) break;
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
