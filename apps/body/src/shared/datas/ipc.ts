/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 10:59:08
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-11 19:35:19
 * @FilePath: /copy_code_desk/src/shared/datas/ipcKey.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

export const defineHandlers = {
  theme: { status: { desc: '全局主题快照' }, set: { desc: '保存主题并同步所有窗口' } },
  startup: { status: { desc: '本次启动初始化阶段快照' } },
  backendLifecycle: {
    status: { servicesName: 'backend-lifecycle', desc: '后端健康与进程归属' },
    retry: { servicesName: 'backend-lifecycle', desc: '重新检测后端' },
    restart: { servicesName: 'backend-lifecycle', desc: '重启本次托管的服务' },
    applyConfig: { servicesName: 'backend-lifecycle', desc: '应用固定端口与启动策略' },
    openSettings: { servicesName: 'backend-lifecycle', desc: '打开后端诊断设置' }
  },
  jobWorkspaces: {
    getSettings: { servicesName: 'job-workspaces', desc: '读取 Job 授权目录与默认目录' },
    addDirectory: { servicesName: 'job-workspaces', desc: '选择并授权 Job 目录' },
    setDefault: { servicesName: 'job-workspaces', desc: '设置 Job 默认目录' },
    revoke: { servicesName: 'job-workspaces', desc: '撤销 Job 目录授权' }
  },
  agent: {
    openPanel: { desc: '打开 Agent 测试面板' },
    run: { desc: '执行 Pi Agent 任务' },
    getRun: { desc: '查询 Pi Agent 运行状态' },
    cancelRun: { desc: '取消指定 Pi Agent 运行' },
    listSessions: { desc: '查询 Agent 会话列表' },
    getSession: { desc: '读取 Agent 会话历史' }
  },
  common: {
    basicTest: {
      desc: '测试'
    },
    getProcessPlatform: {
      servicesName: 'common',
      funcName: 'getProcessPlatform',
      desc: '获取系统平台'
    },
    isLinux: {
      desc: '是否是Linux'
    },
    isMacOS: {
      desc: '是否是Mac'
    },
    isWindows: {
      desc: '是否是windows'
    },
    getStore: {
      desc: '获取缓存'
    },
    setStore: {
      desc: '设置缓存'
    },
    apiRequest: {
      desc: '通用API请求'
    },
    getLocale: {
      desc: '获取当前语言设置'
    },
    setLocale: {
      desc: '设置语言'
    },
    getGlobalShortcuts: {
      desc: '获取全局快捷键信息'
    },
  },
  file: {
    openFolder: {
      desc: '打开文件夹'
    },
    selectFolder: {
      desc: '选择文件夹'
    },
    selectFile: {
      desc: '选择文件'
    },
    saveFile: {
      desc: '保存文件'
    },
    openFiles: {
      desc: '选择文件'
    },
    imageToBase64: {
      desc: '将图片文件转换为base64格式'
    },
    readFileAsArrayBuffer: {
      desc: '读取文件为ArrayBuffer'
    },
    openInTerminal: {
      desc: '在终端中打开路径'
    }
  },
  config: {
    getAllConfigs: {
      desc: '生成configs'
    },
    saveConfig: {
      desc: '保存config'
    },
    getConfigByKey: {
      desc: '获取单个配置项'
    },
    getPetSettings: {
      desc: '获取Pet配置'
    },
    savePetSettings: {
      desc: '保存Pet配置'
    },
    saveConfigItem: {
      desc: '保存单个配置项'
    },
    getSystemVarKeys: {
      desc: '获取系统变量键列表'
    },
    getSystemVarValues: {
      desc: '获取系统变量值列表'
    },
    setSystemVarValues: {
      desc: '设置系统变量值'
    },
    getHearingSettings: {
      desc: '获取录音配置'
    },
    saveHearingSettings: {
      desc: '保存录音配置'
    }
  },
  server: {
    startServer: {
      desc: '启动本地 Express 服务器'
    },
    stopServer: {
      desc: '停止本地 Express 服务器'
    },
    checkServerStatus: {
      desc: '检查本地服务器存活状态'
    },
    getServerPort: {
      desc: '获取本地服务器端口号'
    },
    getServerInterfaces: {
      desc: '获取本地服务器接口清单'
    }
  },
  live2d: {
    setSpeechPlaybackState: { desc: '更新会话播报令牌或使待播放语音失效' },
    isSpeechPlaybackCurrent: { desc: '实际开始播放前核实会话播报令牌' },
    synthesizeTts: {
      desc: '通过已安装的 TTS 插件合成语音'
    },
    getPetModels: {
      desc: '获取Live2D模型列表'
    },
    openWindow: {
      desc: '打开Live2D窗口'
    },
    getCurrentModelInfo: {
      desc: '获取当前Live2D模型信息'
    },
    playMotion: {
      desc: '播放指定Live2D动作'
    },
    setExpression: {
      desc: '设置指定Live2D表情'
    },
    perform: {
      desc: '执行Pet最小表现协议'
    }
  },
  sense: {
    startHearing: {
      desc: '开启监听'
    },
    stopHearing: {
      desc: '停止监听'
    },
    getHearingStatus: {
      desc: '获取监听状态'
    },
    setAutoPasteToFocusedApp: {
      desc: '设置字幕自动粘贴到焦点应用'
    },
    submitHearingQuestion: {
      desc: '提交语音提问文本到后续流程'
    },
    submitRewriteConfirmed: {
      desc: '提交确认后的书面问题'
    },
    openHearingPanel: {
      desc: '打开录音面板'
    },
    closeHearingPanel: {
      desc: '关闭录音面板'
    },
    openChatPanel: {
      desc: '打开语音会话窗口'
    },
    closeChatPanel: {
      desc: '关闭语音会话窗口'
    },
    consumePendingHearingConfirmed: {
      desc: '消费待投递的确认问题'
    },
    submitCompanionQuestion: {
      desc: '会话窗口提交问题到通用问答入口'
    },
    listAsrModels: {
      desc: '获取 ASR 模型列表'
    }
  },
  modelConfig: {
    list: {
      desc: '列出模型档案与当前默认（human-48b 可视化模型配置）'
    },
    switchModel: {
      desc: '切换默认档案/模型（写回 config.json 与 profiles.json）'
    },
    remoteModels: {
      desc: '服务端代理拉取档案通道的可用模型清单（密钥不出后端）'
    },
    probe: {
      desc: '无密钥探测 baseUrl（OpenAI 兼容 /models 或 Ollama /api/tags）'
    },
    validateAll: {
      desc: '校验全部档案配置与连通'
    }
  },
  window: {
    createPetWindow: {
      desc: '创建Pet窗口'
    },
    closePetWindow: {
      desc: '关闭Pet窗口'
    },
    togglePetWindow: {
      desc: '切换Pet窗口显示状态'
    },
    setPetIgnoreMouseEvents: {
      desc: '设置Pet窗口鼠标穿透'
    },
    resizePetWindow: {
      desc: '调整Pet窗口尺寸'
    },
    movePetWindowBy: {
      desc: '按位移移动Pet窗口'
    },
    getPetCursorPosition: {
      desc: '获取鼠标在Pet窗口内的位置'
    }
  },
}
