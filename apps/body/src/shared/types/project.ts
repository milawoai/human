import type { ProjectFuncTemplateResult } from './func-template'
// 基础响应类型
export interface BaseResponse {
  message?: string
}

// 语言类型
export interface Language {
  id: number
  name: string
}

// 标签类型
export interface Tag {
  id: number
  name: string
  langIds?: string
  platformCodes?: string
}

export interface OptionTag {
  id?: number
  name: string
}

// 平台类型
export interface Platform {
  code: number
  key: string
  label: string
}

// 项目类型
export interface Project {
  id: number
  name: string
  description?: string
  projectPath: string
  isValid: number
  isCompany: number
  hasGit: number
  platformCode: number
  platformInfo: Platform
  extraJson?: string
  createdAt: string
  updatedAt: string
  languages?: Language[]
  tags?: Tag[]
}

// 创建项目请求参数
export interface CreateProjectParams {
  name: string
  projectPath: string
  description?: string
  languageIds?: number[]
  tags?: OptionTag[]
  isCompany?: number
  hasGit?: number
  platformCode?: number
  extraJson?: string
}

// 创建项目响应
export interface CreateProjectResponse extends BaseResponse {
  id: number
  name: string
  description?: string
  projectPath: string
  isValid: number
  isCompany: number
  hasGit: number
  platformCode: number
  extraJson?: string
  createdAt: string
  updatedAt: string
}

// 项目列表查询参数
export interface QueryProjectListParams {
  pageNo: number
  pageSize: number
  languageIds?: string
  tagIds?: string
  platformCode?: number
  createTimeStart?: string
  createTimeEnd?: string
}

// 项目列表响应
export interface QueryProjectListResponse {
  total: number
  pageNo: number
  pageSize: number
  items: Project[]
}

// 查询选项响应
export interface QueryProjectParamsResponse {
  languages: Language[]
  tags: Tag[]
  platforms: Platform[]
}

// 创建语言请求参数
export interface CreateLanguageParams {
  name: string
  description?: string
  metaText?: string
}

// 创建语言响应
export interface CreateLanguageResponse extends BaseResponse {
  id: number
  code: string
  name: string
  description?: string
  metaText?: string
  isDelete: number
  createdAt: string
  updatedAt: string
}

// 创建标签请求参数
export interface CreateTagParams {
  type?: 'language' | 'platform' | 'custom'
  name: string
  description?: string
  metaText?: string
  langIds?: number[]
  platformCodes?: number[]
}

// 创建标签响应
export interface CreateTagResponse extends BaseResponse {
  id: number
  type: number
  code: string
  name: string
  description?: string
  metaText?: string
  isDelete: number
  createdAt: string
  updatedAt: string
}

// 通用：按ID删除
export interface IdPayload {
  id: number
}

export interface OpResponse {
  code: number
  msg: string
}

// 项目分析结果
export interface AnalysisResult {
  isValid: boolean
  hasGit: boolean
  proPath: string
  analysis: any
}
export interface ProjectDetailQueryParams {
  projectId: number
}
export interface LanguageSimpleVo {
  id: number
  name: string
  tagId?: number
}
export interface TagSimpleVo {
  id: number
  name: string
}

export interface PlatformOptionVo {
  code: number
  key: string
  label: string
}

export interface ProjectDetailResponse {
  id: number
  name: string
  description: string
  projectPath: string
  isValid: number
  isCompany: number
  hasGit: number
  platformCode: number
  platformInfo: PlatformOptionVo
  extraJson: string
  createdAt: Date
  updatedAt: Date
  languages: LanguageSimpleVo[]
  tags: TagSimpleVo[]
  funcTemplates: ProjectFuncTemplateResult[]
}
