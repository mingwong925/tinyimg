import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { compressImage, formatBytes, type CompressionMode, type CompressionResult, type OutputMode } from './lib/compress'
import './App.css'

type Job = { id: string; file: File; previewUrl: string; progress: number; status: 'ready' | 'processing' | 'done' | 'error'; result?: CompressionResult; error?: string }
type Language = 'en' | 'zh'

function isSupportedImage(file: File) {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)
}

const copy = {
  en: {
    local: 'Local only', privacy: 'Images never leave your device', eyebrow: 'BATCH IMAGE COMPRESSION', title: 'Make every pixel', lighter: 'lighter.', subtitle: 'Compress image file sizes in bulk without changing their dimensions.', subtitle2: 'Fast, private, and entirely in your browser.', drop: 'Drop your images here', browse: 'or click to browse · JPG, PNG, WebP', hint: 'You can add as many as you like', mode: 'COMPRESSION MODE', auto: 'Auto', quality: 'High quality', size: 'Smaller file', format: 'OUTPUT FORMAT', original: 'Keep original', webp: 'Convert to WebP', note: 'Dimensions stay exactly the same. Choose the balance that fits your batch.', smart: 'Automatic balance between quality and file size.', qualityNote: 'Prioritises visual quality with a larger output.', sizeNote: 'Prioritises the smallest output with more colour reduction.', add: 'Add images to begin →', compress: 'Compress', compressing: 'Compressing...', queue: 'YOUR QUEUE', image: 'image', images: 'images', clear: 'Clear all', ready: 'Ready', processing: 'Compressing...', failed: 'Compression failed.', saved: 'SPACE SAVED', completed: 'COMPLETED', zip: 'Download ZIP', localFooter: '100% client-side processing', footer: 'Built for batches, designed for calm.', progress: 'Progress', dimensions: 'Dimensions stay the same', done: 'Done', error: 'Error', download: 'Download',
  },
  zh: {
    local: '僅限本機', privacy: '圖片不會離開你的裝置', eyebrow: '批量圖片壓縮', title: '讓每個像素', lighter: '更輕盈。', subtitle: '批量減少圖片容量，同時保持原始尺寸。', subtitle2: '快速、私密，完全在瀏覽器內完成。', drop: '將圖片拖放到這裡', browse: '或點擊選擇 · JPG、PNG、WebP', hint: '可以一次加入任意數量', mode: '壓縮模式', auto: '自動', quality: '高畫質', size: '最小容量', format: '輸出格式', original: '保留原格式', webp: '轉換為 WebP', note: '圖片尺寸會完全保持不變，請選擇適合這批圖片的平衡。', smart: '自動平衡畫質與檔案容量。', qualityNote: '優先保持畫質，輸出檔案會較大。', sizeNote: '優先減少容量，會進行較明顯的減色。', add: '加入圖片後開始 →', compress: '壓縮', compressing: '壓縮中...', queue: '待處理圖片', image: '張圖片', images: '張圖片', clear: '全部清除', ready: '準備好', processing: '壓縮中...', failed: '壓縮失敗。', saved: '節省容量', completed: '已完成', zip: '下載 ZIP', localFooter: '100% 本機處理', footer: '為批量而生，保持簡潔。', progress: '進度', dimensions: '尺寸保持不變', done: '完成', error: '錯誤', download: '下載',
  },
} as const

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [mode, setMode] = useState<OutputMode>('original')
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('auto')
  const [language, setLanguage] = useState<Language>('en')
  const [dragging, setDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const t = copy[language]

  const addFiles = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter(isSupportedImage)
    setJobs((current) => [...current, ...accepted.map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file), progress: 0, status: 'ready' as const }))])
  }

  const processJobs = async () => {
    if (isProcessing || !jobs.length) return
    const pending = jobs.filter((job) => job.status !== 'done')
    setIsProcessing(true)
    setProgress(0)
    for (const [index, job] of pending.entries()) {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'processing', progress: 0 } : item))
      try {
        const result = await compressImage(job.file, mode, compressionMode, (value) => setJobs((current) => current.map((item) => item.id === job.id ? { ...item, progress: value } : item)))
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'done', progress: 100, result } : item))
      } catch (error) {
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'error', error: error instanceof Error ? error.message : t.failed } : item))
      }
      setProgress(Math.round(((index + 1) / pending.length) * 100))
    }
    setIsProcessing(false)
  }

  const download = (job: Job) => {
    if (!job.result) return
    const url = URL.createObjectURL(job.result.blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = job.result.outputName; anchor.click(); URL.revokeObjectURL(url)
  }

  const downloadZip = async () => {
    const completed = jobs.filter((job) => job.result)
    if (!completed.length) return
    const zip = new JSZip()
    completed.forEach((job) => zip.file(job.result!.outputName, job.result!.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'tinyimg-compressed.zip'; anchor.click(); URL.revokeObjectURL(url)
  }

  const clearJobs = () => { jobs.forEach((job) => URL.revokeObjectURL(job.previewUrl)); setJobs([]); setProgress(0) }
  const completed = jobs.filter((job) => job.result)
  const allCompleted = jobs.length > 0 && jobs.every((job) => job.result || job.status === 'error')
  const totalSaved = completed.reduce((sum, job) => sum + job.file.size - job.result!.blob.size, 0)
  return (
    <main>
      <header className="topbar"><div className="brand"><span className="brand-mark">T</span><span>tiny<span>img</span></span></div><div className="privacy"><span className="dot" /> {t.local} <small>{t.privacy}</small></div><button className="lang" type="button" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}>{language === 'en' ? '中' : 'EN'}</button></header>
      <section className="intro"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}<br /><em>{t.lighter}</em></h1><p className="subtitle">{t.subtitle}<br />{t.subtitle2}</p></section>
      <section className="workspace">
        <div className={`dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }} onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} /><div className="upload-icon">↑</div><h2>{t.drop}</h2><p>{t.browse}</p><span className="drop-hint">{t.hint}</span></div>
        <aside className="settings"><div className="section-label">{t.mode}</div><div className="mode-list"><button className={compressionMode === 'auto' ? 'active' : ''} type="button" onClick={() => setCompressionMode('auto')}><strong>✦ {t.auto}</strong><span>{t.smart}</span></button><button className={compressionMode === 'quality' ? 'active' : ''} type="button" onClick={() => setCompressionMode('quality')}><strong>◌ {t.quality}</strong><span>{t.qualityNote}</span></button><button className={compressionMode === 'size' ? 'active' : ''} type="button" onClick={() => setCompressionMode('size')}><strong>↓ {t.size}</strong><span>{t.sizeNote}</span></button></div><div className="section-label format-label">{t.format}</div><div className="segmented"><button className={mode === 'original' ? 'active' : ''} type="button" onClick={() => setMode('original')}>{t.original}</button><button className={mode === 'webp' ? 'active' : ''} type="button" onClick={() => setMode('webp')}>{t.webp}</button></div><p className="settings-note">{t.note}</p>{isProcessing && <div className="progress-box"><div><span>{t.progress}</span><strong>{progress}%</strong></div><div className="progress-track"><div className="progress-bar" style={{ width: `${progress}%` }} /></div></div>}<button className="compress-button" type="button" disabled={!jobs.length || isProcessing} onClick={allCompleted ? downloadZip : processJobs}>{allCompleted ? `${t.zip} ↓` : isProcessing ? `${t.compressing} ${progress}%` : jobs.length ? `${t.compress} ${jobs.length} ${jobs.length === 1 ? t.image : t.images} →` : t.add}</button></aside>
      </section>
      {jobs.length > 0 && <section className="queue"><div className="queue-head"><div><span className="section-label">{t.queue}</span><strong>{jobs.length} {jobs.length === 1 ? t.image : t.images}</strong></div><button type="button" onClick={clearJobs}>{t.clear}</button></div>{jobs.map((job) => <article className="job" key={job.id}><img className="thumbnail" src={job.previewUrl} alt="" /><div className="file-icon">{job.file.type === 'image/png' ? 'PNG' : job.file.type === 'image/webp' ? 'WEBP' : 'JPG'}</div><div className="job-info"><strong>{job.file.name}</strong><span>{formatBytes(job.file.size)} · {job.status === 'processing' ? `${t.processing} ${job.progress}%` : job.status === 'error' ? job.error : job.result ? `${formatBytes(job.result.blob.size)} · ${job.result.width} × ${job.result.height}` : t.ready}</span>{job.status === 'processing' && <div className="job-progress"><div className="job-progress-bar" style={{ width: `${job.progress}%` }} /></div>}</div>{job.result && <div className="saving">−{Math.max(0, Math.round((1 - job.result.blob.size / job.file.size) * 100))}% · {formatBytes(job.result.blob.size)}</div>}{job.result && <button className="download" type="button" onClick={() => download(job)} aria-label={`${t.download} ${job.file.name}`}>↓</button>}{job.status === 'processing' && <div className="spinner" />}</article>)}</section>}
      {completed.length > 0 && <section className="summary"><div><span>{t.saved}</span><strong>{formatBytes(Math.max(0, totalSaved))}</strong></div><div><span>{t.completed}</span><strong>{completed.length} / {jobs.length}</strong></div><button className="zip-button" type="button" onClick={downloadZip}>{t.zip} <span>↓</span></button></section>}
      <footer><span>© 2026 Ming Wong</span><span>tinyimg <b>·</b> {t.footer}</span><span>{t.localFooter}</span></footer>
    </main>
  )
}

export default App