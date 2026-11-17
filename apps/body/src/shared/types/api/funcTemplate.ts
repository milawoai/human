export interface CreateFuncTemplateDto {
  projectId: number
  templateId: string
  name: string
  desc?: string
  languageId?: number
  templateMetaJson?: string
  templateMethodJson?: string
}

export interface CreateFuncTemplateResponseDto {
  id: number
  templateId: string
  templateName: string
  templateDesc: string
  languageId: number
  templateMetaJson: string
  templateMethodJson: string
  createdAt: Date
  updatedAt: Date
  message: string
}

export interface GetProjectFuncTemplatesDto {
  projectId: number
}

export interface GetFuncTemplateListDto {
  languageIds?: number[]
}

export interface ProjectFTDetailParams {
  projectId: number
  templateId: string
}
export interface ProjectFTDetailRes {
  id: number
  templateId: string
  templateName: string
  templateMetaJson: string
  templateMethodJson: string
  staticParamsValuesJson: string
  methodConfigJson: string
  scriptPath: string
}

export interface UpdateFuncTemplateDto {
  id: number
  templateId?: string
  name?: string
  desc?: string
  languageId?: number
  templateMetaJson?: string
  templateMethodJson?: string
  scriptPath?: string
}

export interface UpdateFuncTemplateResponseDto {
  message: string
  data: {
    id: number
    templateId: string
    templateName: string
    templateDesc: string
    languageId: number
    templateMetaJson: string
    templateMethodJson: string
    createdAt: Date
    updatedAt: Date
  }
}
