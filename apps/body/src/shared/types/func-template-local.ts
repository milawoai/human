import type { FormConfig } from './render'

/**
 * Function template method definition
 */
export interface FuncTemplateMethod {
  /** Method unique identifier */
  id: string
  /** Method name */
  name: string
  /** Method description */
  description: string
  /** Method category */
  category: 'code-gen' | 'build' | 'deploy' | 'test' | 'util' | 'custom'

  /** Static parameters configuration - project-based fixed values, set on first call or user trigger */
  staticParams: FormConfig

  /** Dynamic parameters configuration - parameters provided on each method call */
  dynamicParams: FormConfig

  /** Method implementation function with fixed signature */
  methodMeta: (projectPath: string, staticParams: any, dynamicParams: any) => any

  /** Whether the method is enabled */
  enabled: boolean
}

/**
 * Function template definition
 */
export interface FuncTemplate {
  /** Template unique identifier */
  id: string
  /** Template name */
  name: string
  /** Template description */
  description: string
  /** Template version */
  version?: string
  /** Template author */
  author?: string
  /** Template tags */
  tags?: string[]

  /** Methods provided by the template */
  methods: FuncTemplateMethod[]

  /** Template configuration */
  config?: Record<string, any>
}

export interface FuncTemplateMethodParams extends FuncTemplateMethodInRender {
  /** Static parameters configuration - project-based fixed values, set on first call or user trigger */
  staticParams?: FormConfig

  /** Dynamic parameters configuration - parameters provided on each method call */
  dynamicParams?: FormConfig

  hasStore: boolean

  [key: string]: any
}
export interface FuncTemplateMethodInRender {
  /** Method unique identifier */
  id: string
  /** Method name */
  name: string
  /** Method description */
  description: string
}

export interface FuncTemplateInRender {
  /** Template unique identifier */
  id: string
  /** Template name */
  name: string
  /** Template description */
  description: string
  /** Methods provided by the template */
  methods?: FuncTemplateMethodInRender[]
}

/**
 * Project and function template binding relationship
 */
export interface ProjectFuncTemplateBinding {
  /** Project path */
  projectPath: string
  /** Bound template ID */
  templateId: string
  /** Static parameter values storage for template methods */
  staticParamsValues: Record<string, Record<string, any>> // methodId -> params
}

/**
 * Method call request
 */
export interface MethodCallRequest {
  /** Project path */
  projectPath: string
  /** Template ID */
  templateId: string
  /** Method ID */
  methodId: string
  /** Dynamic parameter values */
  dynamicParams: Record<string, any>
  /** Force reset static parameters */
  forceResetStaticParams?: boolean
}

/**
 * Method call result
 */
export interface MethodCallResult {
  /** Whether successful */
  success: boolean
  /** Return data */
  data?: any
  /** Error message */
  error?: string
  /** Execution logs */
  logs?: string[]
  /** Generated file paths (if any) */
  generatedFiles?: string[]
}
