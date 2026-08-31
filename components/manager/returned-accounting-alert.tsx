import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'

export type ReturnedAccountingItem = {
  id: string
  businessDate: string
  note: string
  href: string
}

export default function ReturnedAccountingAlert({
  items,
  entityLabel = '帳目',
}: {
  items: ReturnedAccountingItem[]
  entityLabel?: string
}) {
  if (items.length === 0) return null

  return (
    <section className="rounded-3xl p-5 mb-4" style={{ background: '#FFF1F2', border: '1.5px solid #FDA4AF', boxShadow: '0 8px 24px rgba(190,18,60,0.10)' }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: '#FFE4E6', color: '#BE123C' }}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black" style={{ color: '#BE123C' }}>有{entityLabel}被總公司退回</h2>
            <p className="text-sm font-bold mt-1" style={{ color: '#9F1239' }}>請先修正下列日期，再重新送出給總公司。</p>
          </div>
        </div>
        <span className="shrink-0 px-3 py-1 rounded-full text-sm font-black" style={{ background: '#FFE4E6', color: '#BE123C' }}>
          {items.length} 筆
        </span>
      </div>

      <div className="space-y-3">
        {items.map(item => (
          <article key={item.id} className="rounded-2xl bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ border: '1px solid #FECDD3' }}>
            <div className="min-w-0">
              <p className="text-lg font-black text-gray-900">{item.businessDate}</p>
              <p className="text-sm font-bold mt-1 break-words" style={{ color: '#BE123C' }}>{item.note}</p>
            </div>
            <Link href={item.href}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2 text-sm font-black text-white"
              style={{ background: '#E11D48' }}>
              去修正 <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
