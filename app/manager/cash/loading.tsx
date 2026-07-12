import { Calculator } from 'lucide-react'

export default function CashLoading() {
  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Calculator className="h-3.5 w-3.5" />
            現金清點
          </div>
          <div className="h-6 w-28 rounded-lg animate-pulse" style={{ background: '#f4f4f5' }} />
          <div className="h-4 w-24 rounded-lg mt-2 animate-pulse" style={{ background: '#f4f4f5' }} />
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-28">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="h-5 w-32 rounded-lg animate-pulse" style={{ background: '#f4f4f5' }} />
            <div className="h-10 w-full rounded-xl animate-pulse" style={{ background: '#fafafa' }} />
            <div className="h-10 w-full rounded-xl animate-pulse" style={{ background: '#fafafa' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
