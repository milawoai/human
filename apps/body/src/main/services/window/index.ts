import { WindowManager } from '../../windowManager'

export const createPetWindow = async () => {
  return WindowManager.getInstance().createPetWindow()
}

export const closePetWindow = async () => {
  return WindowManager.getInstance().closePetWindow()
}

export const togglePetWindow = async () => {
  return WindowManager.getInstance().togglePetWindow()
}

export const setPetIgnoreMouseEvents = async (ignore: boolean) => {
  return WindowManager.getInstance().setPetIgnoreMouseEvents(ignore)
}

export const resizePetWindow = async (width: number, height: number) => {
  return WindowManager.getInstance().resizePetWindow(width, height)
}

export const movePetWindowBy = async (deltaX: number, deltaY: number) => {
  return WindowManager.getInstance().movePetWindowBy(deltaX, deltaY)
}

export const getPetCursorPosition = async () => {
  return WindowManager.getInstance().getPetCursorPosition()
}

export const openConfigWindow = async () => {
  return WindowManager.getInstance().openConfigWindow()
}
