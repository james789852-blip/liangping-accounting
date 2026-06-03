'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadToStorage } from '@/app/actions/upload'
import { toast } from 'sonner'
import { Video, Upload, Loader2, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react'

interface Props {
  storeId: string
  businessDate: string
  userId: string
  disabled?: boolean
  onStatusChange?: (hasVideo: boolean) => void
}

const BUCKET = 'menu-videos'

export default function VideoUploader({ storeId, businessDate, userId, disabled, onStatusChange }: Props) {
  const [existing, setExisting] = useState<{ id: string; file_path: string; file_name: string } | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadExisting() }, [storeId, businessDate])

  async function loadExisting() {
    const supabase = createClient()
    const { data } = await supabase
      .from('menu_videos')
      .select('id, file_path, file_name')
      .eq('store_id', storeId)
      .eq('business_date', businessDate)
      .maybeSingle()
    if (data) {
      setExisting(data)
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(data.file_path, 7200)
      setVideoUrl(signed?.signedUrl ?? null)
      onStatusChange?.(true)
    } else {
      setExisting(null)
      setVideoUrl(null)
      onStatusChange?.(false)
    }
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|m4v)$/i)) {
      toast.error('請選擇影片檔案（mp4、mov 等格式）')
      return
    }

    const ext = file.name.split('.').pop() ?? 'mp4'
    const filePath = `${storeId}/${businessDate}/${Date.now()}.${ext}`

    // 立即顯示本機預覽
    const localPreview = URL.createObjectURL(file)
    setVideoUrl(localPreview)
    setUploading(true)

    const supabase = createClient()
    try {
      if (existing) {
        await supabase.storage.from(BUCKET).remove([existing.file_path]).catch(() => {})
        await supabase.from('menu_videos').delete().eq('id', existing.id)
        setExisting(null)
      }

      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadToStorage(fd, BUCKET, filePath)
      if ('error' in result) throw new Error(result.error)

      const { error: dbErr } = await supabase.from('menu_videos').insert({
        store_id: storeId, business_date: businessDate,
        file_path: filePath, file_name: file.name,
        file_size: file.size, uploaded_by: userId,
      })
      if (dbErr) throw dbErr

      toast.success('影片上傳成功')
      onStatusChange?.(true)
      await loadExisting()
    } catch (err: any) {
      toast.error('上傳失敗：' + err.message)
      setVideoUrl(null)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!existing) return
    const supabase = createClient()
    await supabase.storage.from(BUCKET).remove([existing.file_path]).catch(() => {})
    await supabase.from('menu_videos').delete().eq('id', existing.id)
    setExisting(null)
    setVideoUrl(null)
    onStatusChange?.(false)
    toast.success('影片已刪除')
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !uploading) setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled || uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      {videoUrl ? (
        <div className="space-y-2">
          {/* 影片播放器 */}
          <div className="relative rounded-xl overflow-hidden bg-black">
            <video
              src={videoUrl} controls playsInline
              className="w-full" style={{ maxHeight: '280px', display: 'block' }}
            />
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                style={{ background: 'rgba(0,0,0,0.55)' }}>
                <Loader2 className="h-9 w-9 animate-spin text-white" />
                <p className="text-white text-sm font-semibold">上傳中，請稍候…</p>
              </div>
            )}
          </div>

          {/* 檔案資訊 + 操作按鈕 */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: uploading ? '#60a5fa' : '#10b981' }}>
              {uploading
                ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">
                {uploading ? '上傳中…' : (existing?.file_name ?? '影片已上傳')}
              </span>
            </div>
            {!disabled && !uploading && (
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <button type="button" onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                  <RefreshCw className="h-3 w-3" /> 重新上傳
                </button>
                <button type="button" onClick={handleDelete}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 className="h-3 w-3" /> 刪除
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 拖拉上傳區域 */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          className="w-full flex flex-col items-center gap-2.5 py-10 rounded-xl border-2 border-dashed transition-all select-none"
          style={{
            borderColor: isDragging ? '#6366f1' : disabled ? '#e2e8f0' : '#cbd5e1',
            background: isDragging ? '#eef2ff' : 'transparent',
            color: isDragging ? '#6366f1' : disabled ? '#cbd5e1' : '#94a3b8',
            cursor: disabled || uploading ? 'default' : 'pointer',
          }}>
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm font-medium">上傳中，請稍候…</span>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8" style={{ color: isDragging ? '#6366f1' : undefined }} />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isDragging ? '放開以上傳影片' : '點擊或拖曳影片至此上傳'}
                </p>
                <p className="text-xs mt-1 opacity-60">支援 mp4、mov、avi、mkv 等格式</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
