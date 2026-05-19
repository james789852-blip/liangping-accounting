'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Video, Upload, Loader2, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  storeId: string
  businessDate: string
  userId: string
  disabled?: boolean
}

const BUCKET = 'menu-videos'
const MAX_MB = 500

export default function VideoUploader({ storeId, businessDate, userId, disabled }: Props) {
  const [existing, setExisting] = useState<{ id: string; file_path: string; file_name: string } | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
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
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(data.file_path, 3600)
      setVideoUrl(signed?.signedUrl ?? null)
    } else {
      setExisting(null)
      setVideoUrl(null)
    }
  }

  async function handleFile(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`檔案過大，最大支援 ${MAX_MB}MB`)
      return
    }
    const ext = file.name.split('.').pop() ?? 'mp4'
    const filePath = `${storeId}/${businessDate}/${Date.now()}.${ext}`
    setUploading(true)
    const supabase = createClient()
    try {
      if (existing) {
        await supabase.storage.from(BUCKET).remove([existing.file_path])
        await supabase.from('menu_videos').delete().eq('id', existing.id)
        setExisting(null)
        setVideoUrl(null)
      }
      const { error } = await supabase.storage.from(BUCKET).upload(filePath, file)
      if (error) throw error
      const { error: dbErr } = await supabase.from('menu_videos').insert({
        store_id: storeId, business_date: businessDate,
        file_path: filePath, file_name: file.name,
        file_size: file.size, uploaded_by: userId,
      })
      if (dbErr) throw dbErr
      toast.success('影片上傳成功')
      await loadExisting()
    } catch (err: any) {
      toast.error('上傳失敗：' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!existing) return
    const supabase = createClient()
    await supabase.storage.from(BUCKET).remove([existing.file_path])
    await supabase.from('menu_videos').delete().eq('id', existing.id)
    setExisting(null)
    setVideoUrl(null)
    toast.success('影片已刪除')
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
      {existing && videoUrl ? (
        <div className="space-y-2">
          <video src={videoUrl} controls playsInline className="w-full rounded-lg bg-black" style={{ maxHeight: '200px' }} />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
              <Video className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{existing.file_name}</span>
            </div>
            {!disabled && (
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                  <RefreshCw className="h-3 w-3" /> 重新上傳
                </button>
                <button type="button" onClick={handleDelete} disabled={uploading}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 className="h-3 w-3" /> 刪除
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button" disabled={disabled || uploading}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          className={cn(
            'w-full flex flex-col items-center gap-2 py-8 rounded-xl border-2 border-dashed transition-colors',
            disabled ? 'border-slate-100 text-slate-300 cursor-default' :
            uploading ? 'border-blue-200 text-blue-400 cursor-default' :
            'border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer'
          )}
        >
          {uploading ? (
            <><Loader2 className="h-6 w-6 animate-spin" /><span className="text-sm">上傳中，請稍候...</span></>
          ) : (
            <>
              <Upload className="h-6 w-6" />
              <span className="text-sm">點擊上傳今日菜單影片</span>
              <span className="text-xs opacity-60">mp4、mov 等格式，最大 {MAX_MB}MB</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
