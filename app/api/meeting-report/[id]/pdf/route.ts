import { NextResponse } from 'next/server'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessStore, getAuthContext } from '@/lib/permissions'
import { getMeetingRevenueComparison, type MeetingRevenueComparison } from '@/app/actions/meeting-reports'

export const runtime = 'nodejs'
export const maxDuration = 60

const localChromePath = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome'

async function launchPdfBrowser() {
  const isVercel = Boolean(process.env.VERCEL)
  return puppeteer.launch({
    args: isVercel
      ? await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' })
      : ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: isVercel ? await chromium.executablePath() : localChromePath,
    headless: isVercel ? 'shell' : true,
  })
}

async function loadPdfFontCss() {
  try {
    const cssPath = require.resolve('@fontsource-variable/noto-sans-tc/index.css')
    const css = await readFile(cssPath, 'utf8')
    const files = [...css.matchAll(/url\(\.\/files\/([^)]*\.woff2)\)/g)].map(match => match[1])
    const embeddedFonts = await Promise.all([...new Set(files)].map(async file => {
      const data = await readFile(join(dirname(cssPath), 'files', file))
      return [file, data.toString('base64')] as const
    }))
    const fontsByFile = new Map(embeddedFonts)
    return css.replace(/url\(\.\/files\/([^)]*\.woff2)\)/g, (_match, file: string) => {
      const encoded = fontsByFile.get(file)
      return encoded ? `url(data:font/woff2;base64,${encoded})` : 'url()'
    })
  } catch {
    return ''
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) return new NextResponse('未登入', { status: 401 })

  const { id } = await params
  const admin = createAdminClient()
  const { data: report } = await admin.from('meeting_reports').select('*').eq('id', id).single()
  if (!report) return new NextResponse('找不到報告', { status: 404 })
  if (!canAccessStore(ctx, report.store_id as string)) return new NextResponse('無權限', { status: 403 })

  const [storeResult, thisItemsResult, carryItemsResult, openCarryResult, comparisonResult] = await Promise.all([
    admin.from('stores').select('name').eq('id', report.store_id).single(),
    admin.from('meeting_action_items').select('*').eq('raised_in_report_id', id).order('order_index'),
    admin.from('meeting_action_items').select('*')
      .eq('store_id', report.store_id).eq('resolved_in_report_id', id).neq('raised_in_report_id', id).order('order_index'),
    admin.from('meeting_action_items').select('*')
      .eq('store_id', report.store_id).eq('status', 'open').neq('raised_in_report_id', id).order('order_index'),
    getMeetingRevenueComparison(
      report.store_id,
      report.period_start,
      report.period_end,
      report.comparison_period_start,
      report.comparison_period_end,
    ),
  ])

  const storeName = (storeResult.data?.name as string | null) ?? ''
  const fontCss = await loadPdfFontCss()
  const html = buildHtml({
    report,
    storeName,
    thisItems: thisItemsResult.data ?? [],
    carryItems: [...(carryItemsResult.data ?? []), ...(openCarryResult.data ?? [])],
    comparison: 'error' in comparisonResult ? null : comparisonResult,
    fontCss,
  })

  const browser = await launchPdfBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    })
    const filename = encodeURIComponent(`會議報告_${storeName}_${report.period_start}_${report.period_end}.pdf`)
    return new NextResponse(pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } finally {
    await browser.close()
  }
}

function buildHtml({
  report,
  storeName,
  thisItems,
  carryItems,
  comparison,
  fontCss,
}: {
  report: Record<string, unknown>
  storeName: string
  thisItems: Array<Record<string, unknown>>
  carryItems: Array<Record<string, unknown>>
  comparison: MeetingRevenueComparison | null
  fontCss: string
}) {
  const google = objectValue(report.google_review_data)
  const complaint = objectValue(report.complaint_data)
  const staff = objectValue(report.staff_overview)
  const staffMembers = arrayValue(report.staff_members)
  const vendors = arrayValue(report.vendor_issues)
  const presenters = arrayValue(report.presenters)
  const feedbackPhotos = stringArray(report.customer_feedback_photos)
  const productPhotos = stringArray(report.product_quality_photos)
  const staffPhotos = stringArray(report.staff_status_photos)

  const revenueRows = comparison ? [
    ['總營業額', comparison.current.total, comparison.previous.total],
    ['現場', comparison.current.onsite, comparison.previous.onsite],
    ['Uber Eats', comparison.current.uber, comparison.previous.uber],
    ['foodpanda', comparison.current.panda, comparison.previous.panda],
    ['線上點餐', comparison.current.online, comparison.previous.online],
  ] as Array<[string, number, number]> : []

  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(storeName)}雙週店務會議報告</title>
<style>
  ${fontCss}
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #27272a; font: 13px/1.65 "Noto Sans TC Variable", "PingFang TC", "Microsoft JhengHei", sans-serif; }
  header { border-bottom: 3px solid #f97316; padding-bottom: 15px; margin-bottom: 22px; }
  h1 { margin: 0 0 4px; font-size: 25px; letter-spacing: -.02em; }
  h2 { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #f4f4f5; font-size: 16px; }
  h3 { margin: 12px 0 6px; font-size: 13px; color: #52525b; }
  p { margin: 5px 0; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 10px; color: #71717a; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .box { border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px 12px; }
  .label { color: #71717a; font-size: 11px; font-weight: 700; }
  .value { margin-top: 3px; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e4e4e7; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #fafafa; color: #71717a; font-size: 11px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .up { color: #047857; font-weight: 700; }
  .down { color: #be123c; font-weight: 700; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
  .photos img { width: 100%; height: 115px; border: 1px solid #e4e4e7; border-radius: 6px; object-fit: cover; }
  .action { margin-bottom: 9px; padding: 10px 12px; border-left: 4px solid #f97316; border-radius: 7px; background: #fff7ed; }
  .action.done { border-color: #22c55e; background: #f0fdf4; }
  .action.dropped { border-color: #a1a1aa; background: #f4f4f5; }
  .action-title { font-weight: 700; }
  .action-meta { margin-top: 3px; color: #71717a; font-size: 11px; }
  .action-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; margin-top: 8px; }
  .action-detail div { white-space: pre-wrap; }
  .empty { color: #a1a1aa; }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(storeName)} · 雙週店務會議報告</h1>
    <p>會議日期：${escapeHtml(stringValue(report.meeting_date) || stringValue(report.period_end))}</p>
    <div class="meta">
      <span><strong>比較區間 A：</strong>${escapeHtml(stringValue(report.period_start))} → ${escapeHtml(stringValue(report.period_end))}</span>
      <span><strong>比較區間 B：</strong>${escapeHtml(stringValue(report.comparison_period_start))} → ${escapeHtml(stringValue(report.comparison_period_end))}</span>
      <span><strong>狀態：</strong>${report.status === 'submitted' ? '已提交' : '草稿'}</span>
      ${presenters.length ? `<span><strong>報告人員：</strong>${presenters.map(person => `${escapeHtml(stringValue(person.name))}（${escapeHtml(stringValue(person.role))}）`).join('、')}</span>` : ''}
    </div>
  </header>

  <section>
    <h2>一、營業數據與差異說明</h2>
    ${revenueRows.length ? `<table><thead><tr><th>通路</th><th class="num">區間 A</th><th class="num">區間 B</th><th class="num">A 相較 B</th></tr></thead><tbody>${revenueRows.map(([label, current, previous]) => `<tr><td>${label}</td><td class="num">${formatMoney(current)}</td><td class="num">${formatMoney(previous)}</td><td class="num ${current >= previous ? 'up' : 'down'}">${formatChange(current, previous)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">沒有可顯示的營業資料</p>'}
    ${comparison ? `<h3>比較區間 A 每日營業額</h3>${dailyRevenueTableHtml(comparison.current.daily)}<h3>比較區間 B 每日營業額</h3>${dailyRevenueTableHtml(comparison.previous.daily)}` : ''}
    <h3>營業額差異說明</h3>
    <div class="box"><div class="value">${formatText(stringValue(report.revenue_difference_note) || plainText(stringValue(report.operations_review_html)) || '尚未填寫')}</div></div>
  </section>

  <section>
    <h2>二、Google 評論與客訴</h2>
    <div class="grid">
      <div class="box"><div class="label">Google 評論</div><div class="value">新增 ${numberValue(google.new_reviews)} 則｜平均 ${google.average_rating == null ? '—' : numberValue(google.average_rating)} 星<br/>${formatText(stringValue(google.summary) || '無')}</div></div>
      <div class="box"><div class="label">客訴紀錄</div><div class="value">共 ${numberValue(complaint.count)} 件｜${escapeHtml(stringValue(complaint.category) || '未分類')}<br/>${formatText(stringValue(complaint.description) || '無')}<br/><strong>處理結果：</strong>${formatText(stringValue(complaint.resolution) || '無')}</div></div>
    </div>
    ${photoHtml(feedbackPhotos)}
  </section>

  <section>
    <h2>三、廠商供貨品質及問題</h2>
    ${vendors.length ? `<table><thead><tr><th>廠商</th><th>品項</th><th>問題說明</th><th>處理狀況</th></tr></thead><tbody>${vendors.map(issue => `<tr><td>${escapeHtml(stringValue(issue.vendor))}</td><td>${escapeHtml(stringValue(issue.item))}</td><td>${formatText(stringValue(issue.issue))}</td><td>${escapeHtml(stringValue(issue.status))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">本期無供貨問題</p>'}
    ${photoHtml(productPhotos)}
  </section>

  <section>
    <h2>四、店內同仁目前狀況</h2>
    <div class="grid"><div class="box"><div class="label">人力狀況</div><div class="value">${escapeHtml(stringValue(staff.staffing_status) || '未填寫')}</div></div><div class="box"><div class="label">訓練需求</div><div class="value">${formatText(stringValue(staff.training_needs) || '無')}</div></div></div>
    <div class="box" style="margin-top:10px"><div class="label">其他說明</div><div class="value">${formatText(stringValue(staff.note) || plainText(stringValue(report.staff_status_html)) || '無')}</div></div>
    <h3>個別同仁分析回報</h3>
    ${staffMembers.length ? staffMembers.map((member, index) => staffMemberHtml(member, index)).join('') : '<p class="empty">本期沒有個別同仁分析</p>'}
    ${photoHtml(staffPhotos)}
  </section>

  <section>
    <h2>五、上次問題處理與改善進度</h2>
    ${carryItems.length ? carryItems.map(actionHtml).join('') : '<p class="empty">沒有上次結轉事項</p>'}
  </section>

  <section>
    <h2>六、本次主動提出問題與解法</h2>
    ${thisItems.length ? thisItems.map(actionHtml).join('') : '<p class="empty">尚未新增問題提案</p>'}
  </section>
</body>
</html>`
}

function actionHtml(item: Record<string, unknown>) {
  const details = objectValue(item.details)
  const status = stringValue(item.status)
  const statusText = status === 'resolved' ? '已完成' : status === 'dropped' ? '不再處理' : '進行中'
  return `<div class="action ${status === 'resolved' ? 'done' : status === 'dropped' ? 'dropped' : ''}">
    <div class="action-title">${escapeHtml(stringValue(item.description) || stringValue(details.observation) || '未命名事項')} <span style="float:right">${statusText}</span></div>
    <div class="action-meta">提出人：${escapeHtml(stringValue(details.proposer_name) || '—')}｜負責人：${escapeHtml(stringValue(item.owner_name) || '—')}｜期限：${escapeHtml(stringValue(item.due_date) || '—')}｜進度：${numberValue(item.progress_percent)}%</div>
    <div class="action-detail">
      ${detailCell('影響範圍', stringValue(details.impact))}
      ${detailCell('原因判斷', stringValue(details.cause))}
      ${detailCell('預計處理方式', stringValue(details.solution))}
      ${detailCell('如何確認有效', stringValue(details.verification_method))}
      ${detailCell('本期改善進度', stringValue(item.progress_note))}
      ${detailCell('遇到的困難', stringValue(item.difficulty_note))}
      ${detailCell('需要各店支援', stringValue(item.store_support_note) || stringValue(item.hq_support_note))}
      ${detailCell('處理結論', stringValue(item.resolution_note))}
    </div>
  </div>`
}

function staffMemberHtml(member: Record<string, unknown>, index: number) {
  return `<div class="action ${stringValue(member.current_status) === '表現良好' ? 'done' : ''}">
    <div class="action-title">${index + 1}. ${escapeHtml(stringValue(member.name) || '未填姓名')}｜${escapeHtml(stringValue(member.role) || '未填職務')} <span style="float:right">${escapeHtml(stringValue(member.current_status) || '未填狀況')}</span></div>
    <div class="action-detail">
      ${detailCell('表現亮點', stringValue(member.strengths))}
      ${detailCell('需要改善／觀察', stringValue(member.concerns))}
      ${detailCell('預計處理方式', stringValue(member.action_plan))}
    </div>
  </div>`
}

function detailCell(label: string, value: string) {
  return `<div><span class="label">${label}</span><br/>${formatText(value || '—')}</div>`
}

function dailyRevenueTableHtml(rows: MeetingRevenueComparison['current']['daily']) {
  return `<table><thead><tr><th>日期</th><th class="num">總營業額</th><th class="num">現場</th><th class="num">Uber</th><th class="num">熊貓</th><th class="num">線上點餐</th></tr></thead><tbody>${rows.map(row => row.hasData
    ? `<tr><td>${escapeHtml(row.date)}</td><td class="num">${formatMoney(row.total)}</td><td class="num">${formatMoney(row.onsite)}</td><td class="num">${formatMoney(row.uber)}</td><td class="num">${formatMoney(row.panda)}</td><td class="num">${formatMoney(row.online)}</td></tr>`
    : `<tr><td>${escapeHtml(row.date)}</td><td colspan="5" class="empty">當日尚無營業資料</td></tr>`).join('')}</tbody></table>`
}

function photoHtml(photos: string[]) {
  if (!photos.length) return ''
  return `<div class="photos">${photos.map(url => `<img src="${escapeHtml(url)}" alt="附件照片" />`).join('')}</div>`
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function plainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function formatText(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br/>')
}

function formatMoney(value: number) {
  return `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
}

function formatChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 'A 區間新增' : '—'
  const value = ((current - previous) / previous) * 100
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}
