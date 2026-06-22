'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  storeId: string
  photos: string[]
  onChange: (photos: string[]) => void
  maxPhotos?: number
}

export default function SectionPhotoGrid({ storeId, photos, onChange, maxPhotos = 12 }: Props) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    if (photos.length + files.length > maxPhotos) {
      toast.error(`最多 ${maxPhotos} 張照片`)
      return
    }
    setUploading(true)
    try {
      const supabase = createClient()
      const newUrls: string[] = []
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} 過大（上限 10MB）`)
          continue
        }
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage.from('meeting-reports').upload(path, file, { upsert: false })
        if (error) {
          toast.error(`上傳失敗：${error.message}`)
          continue
        }
        const { data: { publicUrl } } = supabase.storage.from('meeting-reports').getPublicUrl(path)
        newUrls.push(publicUrl)
      }
      if (newUrls.length > 0) {
        onChange([...photos, ...newUrls])
        toast.success(`上傳 ${newUrls.length} 張`)
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removePhoto(idx: number) {
    onChange(photos.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
        {photos.map((url, i) => (
          <div key={url} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#f4f4f5', border: '1px solid #e4e4e7' }}>
            <img src={url} alt={`photo-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} onClick={() => setPreview(url)} />
            <button type="button" onClick={() => removePhoto(i)}
              style={{ position: 'absolute', top: 4, right: 4, height: 24, width: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {photos.length < maxPhotos && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{
              aspectRatio: '1', borderRadius: 10, border: '1.5px dashed #d4d4d8', background: '#fafafa',
              cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: '#71717a', gap: 4, fontFamily: 'inherit', fontSize: 11,
            }}>
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            <span>{uploading ? '上傳中' : '加照片'}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={e => handleFiles(e.target.files)} />

      {preview && (
        <div onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={preview} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" />
          <button type="button"
            style={{ position: 'absolute', top: 16, right: 16, height: 40, width: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}
