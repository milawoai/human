let counter = 0
const nextId = () => `T${String((counter += 1)).padStart(4, '0')}`

export function text(name, content, props = {}) {
  return { id: nextId(), type: 'text', name, content, ...props }
}

export function frame(name, props = {}) {
  return { id: nextId(), type: 'frame', name, children: [], ...props }
}

export function box(type, name, props = {}) {
  return { id: nextId(), type, name, ...props }
}

export const BODY = '$font-body'
export const MONO = '$font-mono'

