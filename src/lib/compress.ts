export type OutputMode = 'original' | 'webp'

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

export async function compressImage(file: File, mode: OutputMode): Promise<CompressionResult> {
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
  if (type === 'image/png') {
    return { blob: file, width, height, quality: null, reachedTarget: true, outputName }
  }

  const quality = 0.82
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
