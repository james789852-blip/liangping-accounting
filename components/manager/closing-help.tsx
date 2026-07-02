'use client'

import { useState, useEffect } from 'react'
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react'

const STORAGE_KEY = 'closing-help-collapsed'

export default function ClosingHelp() {
  // 第一次用會展開；一旦 user 折疊過，之後保持折疊
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY)
    setOpen(v !== 'yes')
  }, [])
  function toggle() {
    const next = !open
    setOpen(next)
    localStorage.setItem(STORAGE_KEY, next ? 'no' : 'yes')
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0" style={{ color: '#92400E' }} />
          <span className="text-sm font-bold" style={{ color: '#7c2d12' }}>📖 每日結帳教學（點展開/收合）</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: '#92400E' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#92400E' }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-[13px] leading-relaxed space-y-2" style={{ color: '#7c2d12' }}>
          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">🎯 結帳基本流程（每日打烊後）</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li><b>輸入營業額</b>：POS / TWPAY / Uber / 熊貓 / 線上 各欄輸入當日金額</li>
              <li><b>拍收據</b>：點「新增收據」上傳照片後 → 輸入廠商 → 品項 → 金額</li>
              <li><b>零用金核對</b>：清點手邊現金和上月未結金額</li>
              <li><b>檢查誤差</b>：若「實際」跟「應繳」差 &gt; 200 元會提示</li>
              <li><b>送出結帳</b>：確認無誤按「送出」</li>
            </ol>
          </div>

          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">📸 收據拍照小技巧</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>把整張發票 / 收據拍清楚，金額欄要看得到</li>
              <li>一張照片對應一筆收據；有多筆分開拍</li>
              <li>系統會自動壓縮照片，不用擔心太大</li>
            </ul>
          </div>

          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">🛒 收據品項怎麼填？</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>先選「大類」（叫貨廠商 / 固定成本 / 其他）</li>
              <li>再選「廠商」（例：菜商、雞肉商、水電費）</li>
              <li>「品項」下拉會出現該廠商的所有品項</li>
              <li>沒看到的品項？聯絡總公司加</li>
            </ul>
          </div>

          <div className="rounded-lg p-3" style={{ background: '#fee2e2', color: '#991b1b' }}>
            <p className="font-bold">⚠️ 常見錯誤</p>
            <ul className="space-y-0.5 list-disc list-inside mt-1">
              <li><b>誤差過大</b>：清點現金前先扣掉客人保留金</li>
              <li><b>收據漏建</b>：一天內所有付款都要建，包括手工帳</li>
              <li><b>備註寫清楚</b>：修東西 / 買東西 / 稅金退回 都寫明</li>
            </ul>
          </div>

          <div className="rounded-lg p-3" style={{ background: '#e0f2fe' }}>
            <p className="font-bold">💡 忘了送出 or 送錯了？</p>
            <p className="mt-1">送出後仍能改：狀態變「已送出」，但總公司可**退回**讓你重編。所有輸入都會保留，不用重打。</p>
          </div>
        </div>
      )}
    </div>
  )
}
