export interface PathTreeNode {
  key: string // 当前节点键名
  path: string[] // 完整路径
  valueType: string // 字段类型（string, number, object, array, null 等）
  children?: PathTreeNode[] // 子节点（若被选择且是 object/array）
}

export interface Option {
  type: string
  key: string
  [key: string]: any
}

export interface Operation {
  type: string
  desc: string
  sectionKey: string
  options: Option[]
  [key: string]: any
}

export interface StepResult {
  type: string
  key: string
  index: number
  result: any
  [key: string]: any
}

export interface CodeGenOperationResult {
  sectionKey: string
  funcType: string
  results: StepResult[]
  columnKey: string
  [key: string]: any
}
export interface CodeGenColumn {
  desc: string
  key: string
}

export interface CodeGenFunction {
  type: string
  desc: string
  [key: string]: any
  options?: {
    type: string
    key: string
    [key: string]: any
  }[]
}

export interface CodeGenSection {
  key: string
  desc: string
  section: number
  funcList: CodeGenFunction[]
  [key: string]: any
}

export interface CodeGenTab {
  desc: string
  key: string
  tableColumns?: CodeGenColumn[]
  tableRows?: CodeGenSection[]
}
