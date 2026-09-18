import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { compressImage, formatBytes, type CompressionResult, type OutputMode } from './lib/compress'
import './App.css'

type Job = { id: string; file: File; previewUrl: string; status: 'ready' | 'processing' | 'done' | 'error'; result?: CompressionResult; error?: string }

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [mode, setMode] = useState<OutputMode>('original')
  const [dragging, setDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const addFiles = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    setJobs((current) => [...current, ...accepted.map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file), status: 'ready' as const }))])
  }
  const processJobs = async () => {
    if (isProcessing || !jobs.length) return
    setIsProcessing(true)
    for (const job of jobs) {
      if (job.status === 'done') continue
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'processing' } : item))
      try {
        const result = await compressImage(job.file, mode)
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'done', result } : item))
      } catch (error) {
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Compression failed.' } : item))
      }
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
  const completed = jobs.filter((job) => job.result)
  const totalSaved = completed.reduce((sum, job) => sum + job.file.size - job.result!.blob.size, 0)

  return (
    <main>
      <header className="topbar"><div className="brand"><span className="brand-mark">T</span><span>tiny<span>img</span></span></div><div className="privacy"><span className="dot" /> Local only <small>Images never leave your device</small></div><button className="lang" type="button">中 / EN</button></header>
      <section className="intro"><p className="eyebrow">BATCH IMAGE COMPRESSION</p><h1>Make every pixel<br /><em>lighter.</em></h1><p className="subtitle">Compress image file sizes in bulk without changing their dimensions.<br />Fast, private, and entirely in your browser.</p></section>
      <section className="workspace">
        <div className={`dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }} onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} /><div className="upload-icon">↑</div><h2>Drop your images here</h2><p>or click to browse · JPG, PNG, WebP</p><span className="drop-hint">You can add as many as you like</span></div>
        <aside className="settings"><div className="auto-badge">✦ AUTO MODE</div><h2>Smart compression</h2><p className="settings-note">We find the best balance between quality and file size automatically. Dimensions stay exactly the same.</p><div className="section-label format-label">OUTPUT FORMAT</div><div className="segmented"><button className={mode === 'original' ? 'active' : ''} type="button" onClick={() => setMode('original')}>Keep original</button><button className={mode === 'webp' ? 'active' : ''} type="button" onClick={() => setMode('webp')}>Convert to WebP</button></div><button className="compress-button" type="button" disabled={!jobs.length || isProcessing} onClick={processJobs}>{isProcessing ? 'Compressing...' : jobs.length ? `Compress ${jobs.length} image${jobs.length === 1 ? '' : 's'} →` : 'Add images to begin →'}</button></aside>
      </section>
      {jobs.length > 0 && <section className="queue"><div className="queue-head"><div><span className="section-label">YOUR QUEUE</span><strong>{jobs.length} image{jobs.length === 1 ? '' : 's'}</strong></div><button type="button" onClick={() => { jobs.forEach((job) => URL.revokeObjectURL(job.previewUrl)); setJobs([]) }}>Clear all</button></div>{jobs.map((job) => <article className="job" key={job.id}><img className="thumbnail" src={job.previewUrl} alt="" /><div className="file-icon">{job.file.type === 'image/png' ? 'PNG' : job.file.type === 'image/webp' ? 'WEBP' : 'JPG'}</div><div className="job-info"><strong>{job.file.name}</strong><span>{formatBytes(job.file.size)} · {job.status === 'processing' ? 'Compressing...' : job.status === 'error' ? job.error : job.result ? `${formatBytes(job.result.blob.size)} · ${job.result.width} × ${job.result.height}` : 'Ready'}</span></div>{job.result && <div className={`saving ${job.result.reachedTarget ? '' : 'warning'}`}>{job.result.reachedTarget ? `−${Math.max(0, Math.round((1 - job.result.blob.size / job.file.size) * 100))}%` : 'Over target'}</div>}{job.result && <button className="download" type="button" onClick={() => download(job)} aria-label={`Download ${job.file.name}`}>↓</button>}{job.status === 'processing' && <div className="spinner" />}</article>)}</section>}
      {completed.length > 0 && <section className="summary"><div><span>SPACE SAVED</span><strong>{formatBytes(Math.max(0, totalSaved))}</strong></div><div><span>COMPLETED</span><strong>{completed.length} / {jobs.length}</strong></div><button className="zip-button" type="button" onClick={downloadZip}>Download ZIP <span>↓</span></button></section>}
      <footer><span>tinyimg <b>·</b> Built for batches, designed for calm.</span><span>100% client-side processing</span></footer>
    </main>
  )
}

export default App
