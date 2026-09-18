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

function compressPngInWorker(file: File, compressionMode: CompressionMode, onProgress?: (progress: number) => void) {
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
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
    file.arrayBuffer().then((source) => worker.postMessage({ source, compressionMode }, [source])).catch(() => reject(new Error('Could not read PNG.')))
  })
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

  const bitmap = await createImageBitmap(file)
  const width = bitmap.width
  const height = bitmap.height
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg' || fileExtension === 'jpg' || fileExtension === 'jpeg'
  const extension = mode === 'webp' ? 'webp' : isJpeg ? 'jpg' : fileExtension
  const outputName = `${file.name.replace(/\.[^/.]+$/, '')}-tiny.${extension}`

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available in this browser.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  onProgress?.(45)

  const type = mode === 'webp' ? 'image/webp' : isJpeg ? 'image/jpeg' : isPng ? 'image/png' : file.type
  const quality = compressionMode === 'size' ? 0.62 : compressionMode === 'quality' ? 0.92 : 0.82
  const encoded = await encode(canvas, type, quality)
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
