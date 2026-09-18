/// <reference lib="webworker" />
import { optimise as optimisePng } from '@jsquash/oxipng'

type WorkerRequest = { source: ArrayBuffer; compressionMode: 'auto' | 'quality' | 'size' }

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const { source, compressionMode } = event.data
    const level = compressionMode === 'size' ? 6 : 3
    const colourStep = compressionMode === 'size' ? 16 : compressionMode === 'quality' ? 4 : 8
    const lossless = await optimisePng(source, { level })
    self.postMessage({ progress: 35 })
    const bitmap = await createImageBitmap(new Blob([source], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not available in this browser.')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = Math.round(image.data[index] / colourStep) * colourStep
      image.data[index + 1] = Math.round(image.data[index + 1] / colourStep) * colourStep
      image.data[index + 2] = Math.round(image.data[index + 2] / colourStep) * colourStep
    }
    context.putImageData(image, 0, 0)
    self.postMessage({ progress: 65 })
    const encoded = await canvas.convertToBlob({ type: 'image/png' })
    const lossy = await optimisePng(await encoded.arrayBuffer(), { level })
    self.postMessage({ progress: 90 })
    const candidates = [source, lossless, lossy]
    const smallest = candidates.reduce((current, candidate) => candidate.byteLength < current.byteLength ? candidate : current)
    self.postMessage({ buffer: smallest, width: canvas.width, height: canvas.height }, [smallest])
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'PNG compression failed.' })
  }
}