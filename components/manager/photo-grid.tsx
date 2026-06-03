'use client'

import { useState } from 'react'
import { X, ZoomIn } from 'lucide-react'

interface PhotoItem { label: string; url: string }

export default function PhotoGrid({ photos }: { photos: PhotoItem[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  return (
    <>
      <div className={photos.length === 1 ? '' : 'grid grid-cols-2 gap-2'}>
        {photos.map((p, i) => (
          <div key={i} className="relative group cursor-pointer rounded-xl overflow-hidden"
            style={{ border: '1px solid #e4e4e7' }}
            onClick={() => setLightbox(p.url)}>
            <img src={p.url} alt={p.label}
              className="w-full object-cover"
              style={{ height: photos.length === 1 ? '200px' : '120px', display: 'block' }} />
            <div className="absolute inset-0 flex items-end p-2"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }}>
              <span className="text-white text-xs font-medium">{p.label}</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.2)' }}>
              <ZoomIn className="h-6 w-6 text-white" />
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', color: 'white' }}>
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt=""
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
