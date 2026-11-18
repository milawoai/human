let neuralBaseUrl = 'http://127.0.0.1:12002/neural'
export function setNeuralTarget(baseUrl: string): void {
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/neural' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw Error('Invalid local Neural target')
  }
  neuralBaseUrl = parsed.href.replace(/\/$/, '')
}
export function getNeuralTarget(): string { return neuralBaseUrl }
