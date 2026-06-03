import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

let genAI: GoogleGenerativeAI

const RECEIPT_PROMPT = `分析這張收據、發票、估價單或送貨單照片，回傳 JSON（只回傳 JSON，不要任何說明文字）：
{
  "vendor_name": "廠商名稱",
  "receipt_type": "invoice（統一發票）或 receipt（收據）或 delivery_note（估價單/送貨單）",
  "total_amount": 總金額整數,
  "tax_amount": 稅額整數,
  "items": [{"name": "品項名稱", "amount": 小計整數}]
}

【total_amount 規則】
- 找收據上的「總計」「合計」「應付金額」「Total」，通常在最下方
- 手寫收據：找最後一行的總數字
- 必須填正整數（去除逗號），例如 1550 而不是 "1,550" 或 null
- 若有含稅金額與未稅金額，填含稅的最終金額

【tax_amount 規則】
- 有「稅額」「營業稅」欄位且總計 = 未稅 + 稅 → 填稅額整數
- 否則填 0

【items 規則】
- 每個品項的 amount 填該行的小計金額（數量×單價），不是單價
- 品項名稱只填品名本身，不含數量單位`

const CHANNEL_PROMPT = `分析這張外送平台或 POS 系統截圖，找出今日銷售總額，回傳 JSON（只回傳 JSON，不要任何說明文字）：
{
  "total_amount": 銷售總額整數,
  "description": "說明找到的是什麼金額"
}

【各平台對照】
- iChef POS 報表：找「結帳總金額」或「銷售總計」，是畫面上最大/最顯眼的數字
- Uber Eats：找「訂單總額」「銷售額」，不是「淨收入」「撥款金額」
- foodpanda 熊貓：找「訂單總額」
- 台灣 Pay：找「交易總金額」

【規則】
- total_amount 必須是正整數（去除逗號），例如 88690
- 若有多個日期的數字，選最近/當天的那筆
- 若有多個金額，選最大最顯眼的那個`

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: '未設定 GOOGLE_GEMINI_API_KEY' }, { status: 500 })
    genAI = new GoogleGenerativeAI(apiKey)

    const { imageUrl, type = 'receipt' } = await req.json()
    if (!imageUrl) return NextResponse.json({ error: '缺少圖片網址' }, { status: 400 })

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) return NextResponse.json({ error: '無法讀取圖片' }, { status: 400 })
    const buffer = await imageRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = (imageRes.headers.get('content-type') || 'image/jpeg') as any

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: { temperature: 0.1 },
    })

    const prompt = type === 'channel' ? CHANNEL_PROMPT : RECEIPT_PROMPT

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      prompt,
    ])

    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: '無法解析辨識結果' }, { status: 500 })

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[recognize-receipt]', e)
    const msg: string = e.message ?? ''
    if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({ error: 'API 請求過於頻繁，請稍後再試' }, { status: 429 })
    }
    const statusMatch = msg.match(/:\s*\[(\d{3}[^\]]*)\]/)
    if (statusMatch) {
      const status = statusMatch[1]
      if (status.startsWith('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        return NextResponse.json({ error: 'API 請求過於頻繁，請稍後再試' }, { status: 429 })
      }
      if (status.startsWith('404')) return NextResponse.json({ error: 'AI 模型不可用（404），請聯繫管理員' }, { status: 500 })
      if (status.startsWith('403')) return NextResponse.json({ error: 'API 金鑰權限不足（403）' }, { status: 500 })
      return NextResponse.json({ error: `辨識失敗（${status}）` }, { status: 500 })
    }
    const brief = msg.slice(0, 120)
    return NextResponse.json({ error: brief || '辨識失敗' }, { status: 500 })
  }
}
