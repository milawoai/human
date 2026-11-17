/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-02-26 15:46:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-03-18 17:15:45
 * @FilePath: /boss-desktop/src/main/store/memory.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
export class SessionStoreHandler {
  private store: Map<string, any> = new Map()

  get<T>(key: string, defaultValue: T | null = null): T | null {
    const value = this.store.get(key) as T | null
    return value !== undefined ? value : defaultValue
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value)
  }
}
const DefaultSessionStoreHandler = new SessionStoreHandler()
export default DefaultSessionStoreHandler
