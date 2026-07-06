export default function Loading() {
  return (
    <div className="w-full px-4 py-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-24 rounded-2xl animate-pulse" style={{ background: '#fff7ed' }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white animate-pulse" style={{ border: '1px solid #f4f4f5' }} />
          ))}
        </div>
        <p className="text-center text-sm text-zinc-400">載入資料中⋯</p>
      </div>
    </div>
  )
}
