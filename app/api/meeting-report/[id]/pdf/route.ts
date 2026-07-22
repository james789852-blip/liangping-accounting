/**
 * 雙週會議報告 PDF 匯出
 *   GET /api/meeting-report/[id]/pdf
 *
 * 流程：
 *   1) 用 admin client 拉資料庫資料
 *   2) 組成 HTML（含 CSS 排版）
 *   3) puppeteer headless 把 HTML 轉 PDF
 *   4) 回傳 PDF blob
 */
import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import puppeteer from 'puppeteer'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return new NextResponse('未登入', { status: 401 })

  const { id } = await params
  const admin = createAdminClient()
  const { data: report } = await admin.from('meeting_reports').select('*').eq('id', id).single()
  if (!report) return new NextResponse('找不到報告', { status: 404 })

  const { data: store } = await admin.from('stores').select('name').eq('id', report.store_id).single()
  const storeName = (store?.name as string) ?? ''

  // 本次提出的行動項目
  const { data: thisItems } = await admin.from('meeting_action_items')
    .select('*').eq('raised_in_report_id', id).order('order_index')

  // 上次結轉的（本次有處理紀錄的）
  const { data: carryItems } = await admin.from('meeting_action_items')
    .select('*')
    .eq('store_id', report.store_id)
    .neq('raised_in_report_id', id)
    .or(`status.eq.resolved,status.eq.dropped,resolved_in_report_id.eq.${id}`)
    .order('order_index')

  // 也撈尚未處理的（仍為 open 但是從前面結轉）
  const { data: openCarryItems } = await admin.from('meeting_action_items')
    .select('*')
    .eq('store_id', report.store_id)
    .eq('status', 'open')
    .neq('raised_in_report_id', id)
    .order('order_index')

  const html = buildHTML({
    report,
    storeName,
    thisItems: (thisItems ?? []) as any[],
    resolvedCarryItems: (carryItems ?? []).filter((i: any) => i.resolved_in_report_id === id) as any[],
    openCarryItems: (openCarryItems ?? []) as any[],
  })

  // 啟動 puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    })
    const filename = encodeURIComponent(`會議報告_${storeName}_${report.period_start}_${report.period_end}.pdf`)
    return new NextResponse(pdf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } finally {
    await browser.close()
  }
}

function buildHTML(opts: {
  report: any
  storeName: string
  thisItems: any[]
  resolvedCarryItems: any[]
  openCarryItems: any[]
}): string {
  const { report, storeName, thisItems, resolvedCarryItems, openCarryItems } = opts

  function section(num: string, title: string, contentHtml: string | null, photos: string[]) {
    const hasContent = contentHtml && contentHtml.replace(/<[^>]*>/g, '').trim().length > 0
    const hasPhotos = photos && photos.length > 0
    if (!hasContent && !hasPhotos) return ''
    return `
<section class="report-section">
  <h2 class="section-title">${num} ${title}</h2>
  ${hasContent ? `<div class="section-body">${contentHtml}</div>` : ''}
  ${hasPhotos ? `
    <div class="photo-grid">
      ${photos.map(p => `<img src="${p}" alt="photo" />`).join('')}
    </div>
  ` : ''}
</section>
    `
  }

  const carryHTML = (resolvedCarryItems.length + openCarryItems.length > 0) ? `
<section class="report-section">
  <h2 class="section-title">五、上次提出的問題追蹤</h2>
  ${[...resolvedCarryItems, ...openCarryItems].map((item, i) => `
    <div class="action-item ${item.status === 'resolved' ? 'resolved' : item.status === 'dropped' ? 'dropped' : 'open'}">
      <div class="action-head">
        <span class="action-status">${item.status === 'resolved' ? '✓ 已解決' : item.status === 'dropped' ? '○ 放棄' : '⋯ 進行中'}</span>
        <span class="action-num">${i + 1}.</span>
        <span class="action-desc">${escapeHtml(item.description)}</span>
      </div>
      ${item.resolution_note ? `<p class="action-note">${escapeHtml(item.resolution_note)}</p>` : ''}
    </div>
  `).join('')}
</section>
  ` : ''

  const nextItemsHTML = thisItems.length > 0 ? `
<section class="report-section">
  <h2 class="section-title">${resolvedCarryItems.length + openCarryItems.length > 0 ? '六' : '五'}、本次提出的改善項目</h2>
  <ol class="next-items">
    ${thisItems.map(item => `<li>${escapeHtml(item.description)}</li>`).join('')}
  </ol>
</section>
  ` : ''

  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>雙週會議報告 - ${storeName}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: "Microsoft JhengHei", "PingFang TC", -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0; padding: 0;
    color: #18181b; line-height: 1.6; font-size: 13px;
  }
  .report-header {
    border-bottom: 3px solid #F59E0B;
    padding-bottom: 16px; margin-bottom: 24px;
  }
  .report-title {
    font-size: 26px; font-weight: 800;
    color: #18181b; margin: 0 0 4px 0;
    letter-spacing: -0.02em;
  }
  .report-subtitle {
    font-size: 14px; color: #71717a; margin: 0;
  }
  .meta-row {
    display: flex; gap: 24px; margin-top: 12px;
    font-size: 12px;
  }
  .meta-row strong { color: #18181b; margin-right: 4px; }
  .meta-row span { color: #52525b; }

  .report-section {
    margin-bottom: 24px;
    page-break-inside: avoid;
  }
  .section-title {
    font-size: 16px; font-weight: 700;
    color: #18181b; margin: 0 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 2px solid #F4F4F5;
  }
  .section-body {
    font-size: 13px; color: #18181b;
  }
  .section-body h2 { font-size: 15px; margin: 12px 0 6px; color: #18181b; }
  .section-body h3 { font-size: 14px; margin: 10px 0 4px; color: #52525b; font-weight: 700; }
  .section-body p { margin: 6px 0; }
  .section-body ul, .section-body ol { margin: 6px 0; padding-left: 24px; }
  .section-body li { margin: 3px 0; }
  .section-body strong { color: #18181b; font-weight: 700; }
  .section-body em { font-style: normal; }
  .section-body em[data-trend="good"] { color: #047857; font-weight: 700; }
  .section-body em[data-trend="bad"] { color: #be123c; font-weight: 700; }
  .section-body em[data-trend="neutral"] { color: #71717a; }

  .photo-grid {
    display: grid; gap: 8px;
    grid-template-columns: repeat(3, 1fr);
    margin-top: 10px;
  }
  .photo-grid img {
    width: 100%; height: 120px; object-fit: cover;
    border-radius: 6px; border: 1px solid #e4e4e7;
  }

  .action-item {
    padding: 10px 12px; margin-bottom: 8px;
    border-radius: 8px;
    border-left: 4px solid;
  }
  .action-item.resolved { background: #F0FDF4; border-color: #22C55E; }
  .action-item.dropped { background: #F4F4F5; border-color: #A1A1AA; }
  .action-item.open { background: #FFFBEB; border-color: #F59E0B; }
  .action-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .action-status {
    font-size: 11px; font-weight: 700;
    padding: 2px 8px; border-radius: 999px;
    background: white;
  }
  .resolved .action-status { color: #047857; }
  .dropped .action-status { color: #71717a; }
  .open .action-status { color: #B45309; }
  .action-num { font-weight: 700; color: #52525b; }
  .action-desc { color: #18181b; flex: 1; min-width: 200px; }
  .action-note {
    font-size: 12px; color: #52525b;
    margin: 6px 0 0 0; padding-left: 12px;
    border-left: 2px solid rgba(0,0,0,0.1);
  }

  .next-items {
    margin: 0; padding-left: 28px;
  }
  .next-items li {
    margin: 6px 0; color: #18181b;
  }
</style>
</head>
<body>
  <div class="report-header">
    <h1 class="report-title">${storeName} · 雙週會議報告</h1>
    <p class="report-subtitle">會議日期：${report.meeting_date ?? report.period_end}</p>
    <div class="meta-row">
      <div><strong>本期區間：</strong><span>${report.period_start} ~ ${report.period_end}</span></div>
      <div><strong>狀態：</strong><span>${report.status === 'submitted' ? '已提交' : '草稿'}</span></div>
    </div>
  </div>

  ${section('一、', '主要營運回顧', report.operations_review_html, [])}
  ${section('二、', '客訴反應 / Google 評論', report.customer_feedback_html, report.customer_feedback_photos ?? [])}
  ${section('三、', '同仁狀況', report.staff_status_html, report.staff_status_photos ?? [])}
  ${section('四、', '產品品質', report.product_quality_html, report.product_quality_photos ?? [])}
  ${carryHTML}
  ${nextItemsHTML}
  ${section('其他', '備註', report.notes_html, report.notes_photos ?? [])}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[ch])
}
