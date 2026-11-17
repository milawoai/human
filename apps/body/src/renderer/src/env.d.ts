/// <reference types="vite/client" />

// AudioWorklet API type definitions
declare global {
  class AudioWorkletProcessor {
    readonly port: MessagePort
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean
  }

  function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void

  interface AudioWorkletGlobalScope extends WorkerGlobalScope {
    registerProcessor: typeof registerProcessor
    AudioWorkletProcessor: typeof AudioWorkletProcessor
  }
}
