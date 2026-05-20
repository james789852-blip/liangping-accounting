import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = await req.json()
    if (!imageUrl) return NextResponse.json({ error: '缺少圖片網址' }, { status: 400 })

    // Fetch image and convert to base64
    const res = await fetch(imageUrl)
    if (!res.ok) return NextResponse.json({ error: '無法讀取圖片' }, { status: 400 })
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = res.headers.get('content-type') || 'image/jpeg'

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: contentType as any, data: base64 },
            },
            {
              type: 'text',
              text: `請分析這張收據或發票照片，以JSON格式回傳以下資訊，只回傳JSON不要其他說明：
{
  "vendor_name": "廠商名稱（如菜商、央廚、雜貨店等）",
  "receipt_type": "invoice（電子發票/統一發票）或 receipt（收據）或 delivery_note（估價單/送貨單）",
  "total_amount": 總金額數字,
  "tax_amount": 稅金數字（沒有則為0）,
  "items": [
    { "name": "品項名稱", "amount": 金額數字 }
  ]
}
如果某項資訊無法辨識，用null表示。`,
            },
          ],
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: '無法解析 AI 回應' }, { status: 500 })

    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '辨識失敗' }, { status: 500 })
  }
}
