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

let webpEncoderModule: Promise<import('@jsquash/webp/codec/enc/webp_enc.js').WebPModule> | undefined

function encode(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser could not encode this image.')), type, quality)
  })
}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; dispose: () => void }

function decodeImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode this image in the current browser.'))
    }
    image.src = url
  })
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() }
    } catch {
      // Fall back to HTMLImageElement for browsers with incomplete ImageBitmap support.
    }
  }
  return decodeImageElement(file)
}

async function compressPngInCanvas(file: File, compressionMode: CompressionMode, onProgress?: (progress: number) => void) {
  const image = await decodeImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) {
    image.dispose()
    throw new Error('Canvas is not available in this browser.')
  }
  try {
    context.drawImage(image.source, 0, 0)
  } finally {
    image.dispose()
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const colourStep = compressionMode === 'size' ? 16 : compressionMode === 'quality' ? 4 : 8
  for (let index = 0; index < pixels.data.length; index += 4) {
    pixels.data[index] = Math.round(pixels.data[index] / colourStep) * colourStep
    pixels.data[index + 1] = Math.round(pixels.data[index + 1] / colourStep) * colourStep
    pixels.data[index + 2] = Math.round(pixels.data[index + 2] / colourStep) * colourStep
  }
  context.putImageData(pixels, 0, 0)
  onProgress?.(65)
  const encoded = await encode(canvas, 'image/png')
  onProgress?.(90)
  return { blob: encoded.size < file.size ? encoded : file, width: image.width, height: image.height }
}

async function compressPngInWorker(file: File, compressionMode: CompressionMode, onProgress?: (progress: number) => void) {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
    return compressPngInCanvas(file, compressionMode, onProgress)
  }
  try {
    return await new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
      const worker = new Worker(new URL('./png-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; width?: number; height?: number; error?: string; progress?: number }>) => {
        if (event.data.progress) onProgress?.(event.data.progress)
        if (event.data.progress && !event.data.buffer) return
        worker.terminate()
        if (event.data.error || !event.data.buffer || !event.data.width || !event.data.height) {
          reject(new Error(event.data.error || 'PNG compression failed.'))
          return
        }
        resolve({ blob: new Blob([event.data.buffer], { type: 'image/png' }), width: event.data.width, height: event.data.height })
      }
      worker.onerror = () => { worker.terminate(); reject(new Error('PNG worker failed.')) }
      file.arrayBuffer()
        .then((source) => worker.postMessage({ source, compressionMode }, [source]))
        .catch(() => { worker.terminate(); reject(new Error('Could not read PNG.')) })
    })
  } catch {
    return compressPngInCanvas(file, compressionMode, onProgress)
  }
}

export async function compressImage(file: File, mode: OutputMode, compressionMode: CompressionMode, onProgress?: (progress: number) => void): Promise<CompressionResult> {
  onProgress?.(5)
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const isPng = file.type === 'image/png' || fileExtension === 'png'
  if (mode === 'original' && isPng) {
    const result = await compressPngInWorker(file, compressionMode, onProgress)
    const blob = result.blob.size < file.size ? result.blob : file
    onProgress?.(100)
    return { blob, width: result.width, height: result.height, quality: null, reachedTarget: true, outputName: `${file.name.replace(/\.[^/.]+$/, '')}-tiny.png` }
  }

  const image = await decodeImage(file)
  const width = image.width
  const height = image.height
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg' || fileExtension === 'jpg' || fileExtension === 'jpeg'
  const extension = mode === 'webp' ? 'webp' : isJpeg ? 'jpg' : fileExtension
  const outputName = `${file.name.replace(/\.[^/.]+$/, '')}-tiny.${extension}`

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    image.dispose()
    throw new Error('Canvas is not available in this browser.')
  }
  try {
    context.drawImage(image.source, 0, 0)
  } finally {
    image.dispose()
  }
  onProgress?.(45)

  const type = mode === 'webp' ? 'image/webp' : isJpeg ? 'image/jpeg' : isPng ? 'image/png' : file.type
  const quality = compressionMode === 'size' ? 0.62 : compressionMode === 'quality' ? 0.92 : 0.82
  let encoded = await encode(canvas, type, quality)
  if (mode === 'webp' && encoded.type !== 'image/webp') {
    webpEncoderModule ??= Promise.all([
      import('@jsquash/webp/codec/enc/webp_enc.js'),
      import('@jsquash/webp/utils.js'),
      import('@jsquash/webp/meta.js'),
    ]).then(([encoder, utils]) => utils.initEmscriptenModule(encoder.default))
    const encoder = await webpEncoderModule
    const { defaultOptions } = await import('@jsquash/webp/meta.js')
    const buffer = encoder.encode(context.getImageData(0, 0, width, height).data, width, height, {
      ...defaultOptions,
      quality: Math.round(quality * 100),
    })
    if (!buffer) throw new Error('WebP encoding failed.')
    const output = new Uint8Array(buffer.length)
    output.set(buffer)
    encoded = new Blob([output.buffer], { type: 'image/webp' })
  }
  onProgress?.(90)
  const result = mode === 'original' && file.size <= encoded.size
    ? { blob: file, quality: null }
    : { blob: encoded, quality }
  onProgress?.(100)
  return { blob: result.blob, width, height, quality: result.quality, reachedTarget: true, outputName }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
