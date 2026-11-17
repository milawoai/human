/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-12-19 10:19:48
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2024-12-19 10:19:59
 * @FilePath: /boss-desktop/src/main/server/utils/server-state.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// 服务器状态管理
class ServerState {
  private isOperating: boolean = false
  private static instance: ServerState

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): ServerState {
    if (!ServerState.instance) {
      ServerState.instance = new ServerState()
    }
    return ServerState.instance
  }

  setOperating(status: boolean): void {
    this.isOperating = status
  }

  isServerOperating(): boolean {
    return this.isOperating
  }

  async waitForServerOperation(timeout = 300000): Promise<void> {
    const startTime = Date.now()
    while (this.isOperating) {
      if (Date.now() - startTime > timeout) {
        throw new Error('等待服务器操作超时')
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

export const serverState = ServerState.getInstance()
