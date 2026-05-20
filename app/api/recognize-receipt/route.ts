import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

let genAI: GoogleGenerativeAI

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: '未設定 GOOGLE_GEMINI_API_KEY，請確認 Vercel 環境變數' }, { status: 500 })
    genAI = new GoogleGenerativeAI(apiKey)

    const { imageUrl } = await req.json()
    if (!imageUrl) return NextResponse.json({ error: '缺少圖片網址' }, { status: 400 })

    // Fetch image and convert to base64
    const res = await fetch(imageUrl)
    if (!res.ok) return NextResponse.json({ error: '無法讀取圖片' }, { status: 400 })
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = (res.headers.get('content-type') || 'image/jpeg') as any

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContent([
      {
        inlineData: { mimeType, data: base64 },
      },
      `請分析這張收據或發票照片，以JSON格式回傳以下資訊，只回傳JSON不要其他說明：
{
  "vendor_name": "廠商名稱（如菜商、央廚、雜貨店等）",
  "receipt_type": "invoice（統一發票）或 receipt（收據）或 delivery_note（估價單/送貨單）",
  "total_amount": 總金額數字,
  "tax_amount": 稅金數字（沒有則為0）,
  "items": [
    { "name": "品項名稱", "amount": 金額數字 }
  ]
}
如果某項資訊無法辨識，用null表示。`,
    ])

    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: '無法解析辨識結果' }, { status: 500 })

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '辨識失敗' }, { status: 500 })
  }
}
