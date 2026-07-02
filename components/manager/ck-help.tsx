'use client'

import { useState, useEffect } from 'react'
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react'

const STORAGE_KEY = 'ck-help-collapsed'

export default function CKHelp() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(localStorage.getItem(STORAGE_KEY) === 'open')
  }, [])
  function toggle() {
    const next = !open
    setOpen(next)
    localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed')
  }
  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0" style={{ color: '#92400E' }} />
          <span className="text-sm font-bold" style={{ color: '#7c2d12' }}>📖 央廚每日輸入教學</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: '#92400E' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#92400E' }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-[13px] leading-relaxed space-y-2" style={{ color: '#7c2d12' }}>
          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">🎯 央廚每日 3 個輸入區</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li><b>成員店家訂單</b>：各分店今天叫貨的金額</li>
              <li><b>體系外店家訂單</b>：外部客戶訂單（可加新店名）</li>
              <li><b>支出明細</b>：買原料 / 修東西 / 電費 等</li>
            </ol>
          </div>

          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">🛒 新增支出時 4 個必填欄</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li><b>類別</b>（食材 / 耗材 / 雜項）</li>
              <li><b>品項名</b>（例：順正雞肉、大辣椒）</li>
              <li><b>廠商群組</b>（例：雞肉商、菜商、雜貨）→ 決定 Excel Row 1</li>
              <li><b>單據類型</b>（發票 / 收據 / 估價單 / 公司開）→ 決定 Excel Row 2</li>
            </ul>
          </div>

          <div className="rounded-lg p-3" style={{ background: '#e0f2fe' }}>
            <p className="font-bold">💡 廠商群組怎麼選？</p>
            <p className="mt-1">已在總公司「收據廠商設定」設好，輸入時會**自動建議**。選了後**單據類型也自動帶入**。</p>
          </div>

          <div className="rounded-lg p-3" style={{ background: '#fee2e2', color: '#991b1b' }}>
            <p className="font-bold">⚠️ 常見錯誤</p>
            <ul className="space-y-0.5 list-disc list-inside mt-1">
              <li><b>廠商群組拼錯</b>：會導致 Excel 分成兩欄，請用建議清單</li>
              <li><b>誰付錢</b>要填清楚（自己付 / 老闆付 / 公款）</li>
              <li><b>照片</b>：一張收據拍一張，保留憑證</li>
            </ul>
          </div>

          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">✅ 完成後</p>
            <p>點「送出」後總公司會看到。若要修改，可以先存「草稿」慢慢調，確認再送出。</p>
          </div>
        </div>
      )}
    </div>
  )
}
