import { optimise as optimisePng } from '@jsquash/oxipng'

export type OutputMode = 'original' | 'webp'
export type CompressionMode = 'auto' | 'quality' | 'size'

export type CompressionResult = {
  blob: Blob
  width: number
  height: number
  quality: number | null
  reachedTarget: boolean
  outputName: string
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser could not encode this image.')), type, quality)
  })
}

async function optimiseLossyPng(canvas: HTMLCanvasElement, colourStep: number, level: number) {
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = Math.round(image.data[index] / colourStep) * colourStep
    image.data[index + 1] = Math.round(image.data[index + 1] / colourStep) * colourStep
    image.data[index + 2] = Math.round(image.data[index + 2] / colourStep) * colourStep
  }
  context.putImageData(image, 0, 0)
  const encoded = await encode(canvas, 'image/png')
  const optimised = await optimisePng(await encoded.arrayBuffer(), { level })
  return new Blob([optimised], { type: 'image/png' })
}

export async function compressImage(file: File, mode: OutputMode, compressionMode: CompressionMode): Promise<CompressionResult> {
  const bitmap = await createImageBitmap(file)
  const width = bitmap.width
  const height = bitmap.height
  const extension = mode === 'webp' ? 'webp' : file.name.split('.').pop() || 'jpg'
  const outputName = `${file.name.replace(/\.[^/.]+$/, '')}-tiny.${extension}`

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available in this browser.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const type = mode === 'webp' ? 'image/webp' : file.type
  if (mode === 'original' && file.type === 'image/png') {
    const level = compressionMode === 'size' ? 6 : 3
    const colourStep = compressionMode === 'size' ? 16 : compressionMode === 'quality' ? 4 : 8
    const lossless = new Blob([await optimisePng(await file.arrayBuffer(), { level })], { type: 'image/png' })
    const lossy = await optimiseLossyPng(canvas, colourStep, level)
    const candidates = [file, lossless, ...(lossy ? [lossy] : [])]
    const blob = candidates.reduce((smallest, candidate) => candidate.size < smallest.size ? candidate : smallest)
    return { blob, width, height, quality: null, reachedTarget: true, outputName }
  }

  const quality = compressionMode === 'size' ? 0.62 : compressionMode === 'quality' ? 0.92 : 0.82
  const encoded = await encode(canvas, type, quality)
  const result = mode === 'original' && file.size <= encoded.size
    ? { blob: file, quality: null }
    : { blob: encoded, quality }
  return { blob: result.blob, width, height, quality: result.quality, reachedTarget: true, outputName }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
