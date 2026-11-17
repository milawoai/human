/**
 * 表单字段渲染类型
 * 基于 CustomForm.vue 支持的组件类型
 */
export type RenderType =
  | 'input' // 文本输入框 (InputText)
  | 'password' // 密码输入框 (Password)
  | 'textarea' // 多行文本框 (Textarea)
  | 'select' // 下拉选择框 (Select)
  | 'checkbox' // 复选框 (Checkbox)
  | 'number' // 数字输入框 (InputNumber)
  | 'switch' // 开关 (ToggleSwitch)
  | 'date' // 日期选择器 (DatePicker)
  | 'radio' // 单选按钮组 (RadioButton)
  | 'object' // 对象输入 (ObjectInput)
  | 'list' // 列表输入 (ListInput)
  | 'generateConfig' // 生成配置 (GenerateConfig)
  | 'customSelect' // 自定义选择器 (CustomSelect)
  | 'tagInput' // 标签输入 (TagInput)
  | 'folderPath' // 文件夹选择 (SelectFolderLine)

/**
 * RenderType 配置说明
 *
 * ## 需要 options 的类型
 * - select: 下拉选择框，必须提供 options 数组，格式: [{ label: '显示文本', value: 实际值 }]
 * - radio: 单选按钮组，必须提供 options 数组
 * - customSelect: 自定义选择器，必须提供 options 数组
 *
 * ## 支持 renderParams 的类型及其参数
 * - input: { placeholder?: string, maxlength?: number, disabled?: boolean }
 * - password: { placeholder?: string, feedback?: boolean, toggleMask?: boolean }
 * - textarea: { placeholder?: string, rows?: number, autoResize?: boolean }
 * - select: { placeholder?: string, filter?: boolean, showClear?: boolean }
 * - checkbox: { binary?: boolean, disabled?: boolean }
 * - number: { min?: number, max?: number, step?: number, showButtons?: boolean, placeholder?: string }
 * - switch: { disabled?: boolean }
 * - date: { dateFormat?: string, showTime?: boolean, showButtonBar?: boolean }
 * - radio: { disabled?: boolean }
 * - object: { schema?: Record<string, any> } // 对象字段定义
 * - list: { itemType?: RenderType, addButtonText?: string, minItems?: number, maxItems?: number }
 * - generateConfig: 特定的生成配置参数
 * - customSelect: { multiple?: boolean, filter?: boolean }
 * - tagInput: { separator?: string, allowDuplicates?: boolean, placeholder?: string }
 *
 * ## 示例
 * ```typescript
 * // 下拉选择框
 * {
 *   renderType: 'select',
 *   renderLabel: '选择框架',
 *   options: [
 *     { label: 'Vue', value: 'vue' },
 *     { label: 'React', value: 'react' }
 *   ],
 *   renderParams: { placeholder: '请选择', filter: true }
 * }
 *
 * // 数字输入框
 * {
 *   renderType: 'number',
 *   renderLabel: '端口号',
 *   renderParams: { min: 1000, max: 9999, showButtons: true }
 * }
 * ```
 */
export interface FormField {
  renderType: RenderType
  renderLabel: string
  renderParams?: Record<string, any>
  key: string
  value: any
  options?: Array<{ label: string; value: any }>
  rules?: Array<{ required?: boolean; message?: string }>
}

export interface FormConfig {
  fields: FormField[]
  layout?: 'vertical' | 'horizontal'
  labelWidth?: string
}
