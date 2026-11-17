/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-06-17 18:03:28
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-06-24 09:52:17
 * @FilePath: /electron-app/src/main/store/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import Store from 'electron-store'
export class StoreHandler {
  private store: Store

  constructor() {
    this.store = new Store()
  }

  get<T>(key: string, defaultValue: T | null = null): T | null {
    const res = this.store.get(key) as T | null
    if (!res && defaultValue) {
      return defaultValue
    }
    return res
  }

  set<T>(key: string, value: T): void {
    return this.store.set(key, value)
  }

  addList<T>(key: string, value: T): T[] {
    const list = this.get<T[]>(key) || []
    if (Array.isArray(list)) {
      list.push(value)
      this.set(key, list)
      return list
    } else if (list === null) {
      this.set(key, [value])
      return [value]
    } else {
      throw new Error('Invalid list')
    }
  }

  removeFromList<T>(key: string, predicate: (item: T) => boolean): T[] {
    const list = this.get<T[]>(key) || []
    if (Array.isArray(list)) {
      const newList = list.filter((item) => !predicate(item))
      this.set(key, newList)
      return newList
    }
    return []
  }

  updateList<T>(key: string, predicate: (item: T) => boolean, newValue: T): T[] {
    const list = this.get<T[]>(key) || []
    if (Array.isArray(list)) {
      const index = list.findIndex(predicate)
      if (index !== -1) {
        list[index] = newValue
        this.set(key, list)
      }
      return list
    }
    return []
  }

  addVListToList<T>(key: string, value: T[]): T[] {
    const list = this.get<T[]>(key) || []
    if (Array.isArray(list)) {
      this.set(key, list.concat(value))
      return list
    } else if (list === null) {
      this.set(key, value)
      return value
    } else {
      throw new Error('Invalid list')
    }
  }

  addValueToKeyList<T>(key: string, innerKey: string, value: T | T[]): T[] {
    const obj = this.get<Record<string, T[]>>(key) || {}
    let list = obj[innerKey] || []
    if (Array.isArray(value)) {
      list = list.concat(value)
      obj[innerKey] = list
      this.set(key, obj)
      return obj[innerKey]
    } else {
      list.push(value)
      obj[innerKey] = list
      this.set(key, obj)
      return obj[innerKey]
    }
  }

  delete(key: string): void {
    this.store.delete(key)
  }
}
const DefaultStoreHandler = new StoreHandler()
export default DefaultStoreHandler
