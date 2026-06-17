// 臨時 debug 端點：檢查特定店家某月的稅金路由邏輯。
// 用法：/api/debug/tax-routing?storeId=景新店ID&month=2026-06
// 部署後可直接從瀏覽器開啟，回傳 JSON。

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getMonthLastDay } from '@/lib/business-date'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const month = searchParams.get('month')
  if (!storeId || !month) return NextResponse.json({ error: '缺少 storeId 或 month' }, { status: 400 })

  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  const admin = createAdminClient()

  const [{ data: receipts }, { data: mappings }] = await Promise.all([
    admin.from('receipts')
      .select('id, business_date, vendor_name, tax_amount, receipt_items(item_name, excel_column, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('item_column_mappings').select('item_name, excel_column, item_category, vendor_group, store_id')
      .or(`store_id.is.null,store_id.eq.${storeId}`),
  ])

  // 建 vendorGroupLookup
  const vendorGroupLookup: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (mappings ?? []) as any[]) {
    if (m.vendor_group) {
      vendorGroupLookup[m.item_name] = m.vendor_group
      vendorGroupLookup[m.excel_column] = m.vendor_group
    }
  }

  // Runtime fallback：從模板 row 1 補
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tmplStructure: any = null
  const vgFallback: Record<string, string> = {}
  try {
    const { data: tmpl } = await admin.storage.from('excel-templates').download(`${storeId}.xlsx`)
    if (tmpl) {
      const wb = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(Buffer.from(await tmpl.arrayBuffer()) as any)
      const ws = wb.getWorksheet(`${monthNum}月食耗成本`)
        ?? wb.worksheets.find(s => s.name.includes('食耗'))
        ?? wb.worksheets[0]
      if (ws) {
        let headerRowNum = -1
        for (let r = 1; r <= 10; r++) {
          if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
        }
        const groupOfCol: Record<number, string> = {}
        let lastGroup = ''
        const endCol = Math.min((ws.columnCount || 0) + 10, 200)
        for (let c = 1; c <= endCol; c++) {
          const t = ws.getRow(1).getCell(c).text?.trim()
          if (t) lastGroup = t
          if (lastGroup) groupOfCol[c] = lastGroup
        }
        // build vendorMaps
        const vendorMaps: Record<string, Record<string, number>> = {}
        const taxColsInTemplate: { col: number; letter: string; header: string; group: string }[] = []
        if (headerRowNum > 0) {
          ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
            const t = (cell.text ?? '').trim()
            if (!t) return
            const group = groupOfCol[colNum] ?? ''
            if (group && group !== '央廚配送') {
              if (!vendorMaps[group]) vendorMaps[group] = {}
              vendorMaps[group][t] = colNum
            }
            if (t.includes('稅')) {
              taxColsInTemplate.push({ col: colNum, letter: ws.getColumn(colNum).letter, header: t, group })
            }
            if (!vendorGroupLookup[t] && group && group !== '央廚配送' && group !== '退稅' && group !== '稅金') {
              vgFallback[`${t}@col${colNum}`] = group
            }
          })
        }
        tmplStructure = {
          worksheet: ws.name,
          headerRowNum,
          taxColsInTemplate,
          vendorMapsSummary: Object.fromEntries(
            Object.entries(vendorMaps).map(([k, v]) => [k, Object.entries(v).map(([n, c]) => `${ws.getColumn(c).letter}=${n}`).join(', ')])
          ),
        }
      }
    }
  } catch (e) {
    tmplStructure = { error: (e as Error).message }
  }

  // 模擬每筆 receipt 的稅金路由
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxRoutes = ((receipts ?? []) as any[])
    .filter(r => (r.tax_amount ?? 0) > 0)
    .map(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = ((r.receipt_items ?? []) as any[]).filter(it => (it.amount ?? 0) > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vg = items.map((it: any) => vendorGroupLookup[it.item_name] ?? vendorGroupLookup[it.excel_column])
        .find(Boolean)
      const itemNames = [...new Set(items.map(it => it.item_name as string).filter(Boolean))].join('|')
      const taxKey = vg ? `_tax_${vg}::${itemNames}` : '稅金'
      return {
        receipt_id: r.id,
        business_date: r.business_date,
        vendor_name: r.vendor_name,
        items: items.map(it => `${it.item_name}=${it.amount}`),
        tax_amount: r.tax_amount,
        resolved_vg: vg ?? '(undefined)',
        taxKey,
      }
    })

  return NextResponse.json({
    storeId,
    month,
    vendorGroupLookup_size: Object.keys(vendorGroupLookup).length,
    vgFallback_added: Object.keys(vgFallback).length,
    vgFallback_entries: vgFallback,
    template: tmplStructure,
    taxRoutes,
  }, { status: 200 })
}
