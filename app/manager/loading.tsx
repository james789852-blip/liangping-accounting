export default function Loading() {
  return (
    <div className="w-full px-4 py-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-20 rounded-2xl animate-pulse" style={{ background: '#fff7ed' }} />
        <div className="rounded-2xl bg-white p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: '#f4f4f5' }} />
          ))}
        </div>
        <p className="text-center text-sm text-zinc-400">載入資料中⋯</p>
      </div>
    </div>
  )
}
