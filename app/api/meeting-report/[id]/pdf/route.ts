import { NextResponse } from 'next/server'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessStore, getAuthContext } from '@/lib/permissions'
import { getMeetingRevenueComparison, type MeetingRevenueComparison } from '@/app/actions/meeting-reports'
import {
  buildPdfDailyComparisonRows,
  buildPdfRevenueRows,
  choosePdfDensity,
  photoGridClass,
  type PdfDailyRevenueRow,
} from '@/lib/meeting-report-pdf-layout'

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
  // Turbopack cannot preserve require.resolve() here and compiled the path to
  // undefined in production. outputFileTracingIncludes copies this directory
  // into the server function, so resolve it from the deployment root instead.
  const cssPath = join(
    process.cwd(),
    'node_modules',
    '@fontsource-variable',
    'noto-sans-tc',
    'index.css',
  )
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
      report.store_delivery_data,
    ),
  ])

  const storeName = (storeResult.data?.name as string | null) ?? ''
  const currentItems = (thisItemsResult.data ?? []) as Array<Record<string, unknown>>
  const initialTrackingItems = currentItems.filter(item => Boolean(objectValue(item.details).is_initial_tracking))
  const fontCss = await loadPdfFontCss()
  const html = buildHtml({
    report,
    storeName,
    thisItems: currentItems.filter(item => !Boolean(objectValue(item.details).is_initial_tracking)),
    carryItems: [...(carryItemsResult.data ?? []), ...(openCarryResult.data ?? []), ...initialTrackingItems],
    comparison: 'error' in comparisonResult ? null : comparisonResult,
    fontCss,
  })

  const browser = await launchPdfBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images, image => {
        if (image.complete) return image.decode().catch(() => undefined)
        return new Promise<void>(resolve => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        })
      }))
    })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;margin:0 11mm;padding-bottom:5px;border-bottom:1px solid #e4e4e7;color:#71717a;font:8.5px Arial,sans-serif;display:flex;justify-content:space-between;letter-spacing:.03em"><span style="font-weight:700;color:#27272a">雙週店務會議報告</span><span>${escapeHtml(storeName)}　${escapeHtml(String(report.period_start))} - ${escapeHtml(String(report.period_end))}</span></div>`,
      footerTemplate: `<div style="width:100%;margin:0 11mm;padding-top:5px;border-top:1px solid #e4e4e7;color:#a1a1aa;font:8.5px Arial,sans-serif;display:flex;justify-content:space-between"><span>內部營運會議文件 · ${escapeHtml(storeName)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: '18mm', bottom: '17mm', left: '11mm', right: '11mm' },
    })
    const filename = encodeURIComponent(`會議報告_${storeName}_${report.period_start}_${report.period_end}.pdf`)
    return new NextResponse(pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
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
  const googleReviews = arrayValue(google.reviews)
  const complaint = objectValue(report.complaint_data)
  const complaints = arrayValue(complaint.complaints)
  const staffMembers = arrayValue(report.staff_members)
  const vendors = arrayValue(report.vendor_issues)
  const productPhotos = stringArray(report.product_quality_photos)

  const revenueRows = comparison ? buildPdfRevenueRows(comparison) : []
  const totalChange = comparison ? formatChange(comparison.current.total, comparison.previous.total) : '—'
  const completedActions = carryItems.filter(item => stringValue(item.status) === 'resolved').length
  const hasVendorSection = vendors.length > 0 || productPhotos.length > 0
  const hasStaffSection = staffMembers.length > 0
  const hasCarrySection = carryItems.length > 0
  const hasProposalSection = thisItems.length > 0
  let sectionCounter = 2
  const nextSectionNumber = () => String(sectionCounter++).padStart(2, '0')
  const customerSectionNumber = nextSectionNumber()
  const vendorSectionNumber = hasVendorSection ? nextSectionNumber() : null
  const staffSectionNumber = hasStaffSection ? nextSectionNumber() : null
  const carrySectionNumber = hasCarrySection ? nextSectionNumber() : null
  const proposalSectionNumber = hasProposalSection ? nextSectionNumber() : null
  const attachedPhotoCount = productPhotos.length
    + googleReviews.reduce((sum, item) => sum + stringArray(item.photos).length, 0)
    + complaints.reduce((sum, item) => sum + stringArray(item.photos).length, 0)
    + carryItems.reduce((sum, item) => sum + stringArray(item.photos).length, 0)
    + thisItems.reduce((sum, item) => sum + stringArray(item.photos).length, 0)
  const entryCount = googleReviews.length + complaints.length + vendors.length
    + staffMembers.length + carryItems.length + thisItems.length
  const reportTextLength = JSON.stringify({
    revenue: report.revenue_difference_note,
    googleReviews,
    complaints,
    vendors,
    staffMembers,
    carryItems,
    thisItems,
  }).length
  const density = choosePdfDensity({
    dailyRowCount: comparison ? comparison.current.daily.length + comparison.previous.daily.length : 0,
    entryCount,
    photoCount: attachedPhotoCount,
    textLength: reportTextLength,
  })

  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(storeName)}雙週店務會議報告</title>
<style>
  ${fontCss}
  @page { size: A4; }
  :root { --ink:#18181b; --muted:#71717a; --line:#e4e4e7; --soft:#f7f7f8; --orange:#ea580c; --orange-soft:#fff7ed; --green:#047857; --green-soft:#ecfdf5; }
  * { box-sizing: border-box; }
  html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { margin: 0; color: #27272a; background: #fff; font-family: "Noto Sans TC Variable", "PingFang TC", "Microsoft JhengHei", sans-serif; font-size:11.5px; line-height:1.62; }
  body.density-balanced { font-size:11px; line-height:1.55; }
  body.density-dense { font-size:10.6px; line-height:1.5; }
  body.density-balanced section { margin-bottom:17px; }
  body.density-dense section { margin-bottom:14px; }
  body.density-dense .action { margin-bottom:9px; padding:10px 11px; }
  body.density-dense .action-detail > div { padding:7px 8px; }
  .cover { position: relative; overflow: hidden; margin-bottom: 21px; padding: 25px 27px 23px; border-radius: 16px; background: linear-gradient(135deg,#111113 0%,#202023 62%,#2b211b 100%); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); }
  .cover:before { position:absolute; inset:0 auto 0 0; width:7px; background:linear-gradient(#fb923c,#ea580c); content:""; }
  .cover:after { position:absolute; top:-95px; right:-55px; width:255px; height:255px; border:44px solid rgba(249,115,22,.12); border-radius:50%; content:""; }
  .brand { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; }
  .brand-name { color:#fb923c; font-size:8.5px; font-weight:900; letter-spacing:.22em; }
  .status { border:1px solid rgba(255,255,255,.16); border-radius:99px; padding:4px 10px; background:rgba(255,255,255,.07); color:#d4d4d8; font-size:8.5px; font-weight:800; letter-spacing:.06em; }
  .cover-kicker { position:relative; z-index:1; margin-top:22px; color:rgba(255,255,255,.48); font-size:9px; font-weight:700; letter-spacing:.13em; }
  .cover h1 { position:relative; z-index:1; margin:5px 0 5px; font-size:27px; line-height:1.25; font-weight:950; letter-spacing:-.03em; }
  .cover-subtitle { position:relative; z-index:1; width:78%; margin:0; color:rgba(255,255,255,.62); font-size:10.5px; line-height:1.65; }
  .cover-meta { position:relative; z-index:1; display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:18px; }
  .cover-meta div { min-height:48px; border:1px solid rgba(255,255,255,.09); border-radius:9px; padding:8px 10px; background:rgba(255,255,255,.045); }
  .cover-meta small { display:block; color:rgba(255,255,255,.4); font-size:7.5px; font-weight:800; letter-spacing:.1em; }
  .cover-meta strong { display:block; margin-top:3px; color:rgba(255,255,255,.92); font-size:9.5px; line-height:1.45; }
  h2 { margin:0; color:var(--ink); font-size:17px; line-height:1.25; font-weight:950; letter-spacing:-.02em; }
  h3 { break-after:avoid-page; page-break-after:avoid; margin:16px 0 8px; padding-left:9px; border-left:4px solid #fb923c; color:#27272a; font-size:12.5px; font-weight:900; }
  h4 { break-after:avoid-page; page-break-after:avoid; margin:0 0 7px; color:#52525b; font-size:10px; font-weight:900; }
  p { margin:5px 0; }
  section { margin-bottom:20px; }
  .page-start { padding-top:3mm; }
  .section-heading { break-after:avoid-page; page-break-after:avoid; display:flex; align-items:center; gap:12px; margin-bottom:14px; padding:0 0 9px; border-bottom:2px solid #27272a; }
  .section-heading + * { break-before:avoid-page; page-break-before:avoid; }
  .section-number { display:inline-flex; width:34px; height:34px; flex:0 0 34px; align-items:center; justify-content:center; border-radius:9px; background:var(--ink); color:#fb923c; font-size:10px; font-weight:950; }
  .section-eyebrow { margin-bottom:2px; color:#a1a1aa; font-size:7px; font-weight:900; letter-spacing:.17em; }
  .kpis { break-inside:avoid-page; page-break-inside:avoid; display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:11px; }
  .kpi { min-height:69px; border:1px solid var(--line); border-top:3px solid #d4d4d8; border-radius:9px; padding:10px 11px; background:#fff; }
  .kpi.accent { border-color:#fdba74; border-top-color:#f97316; background:var(--orange-soft); }
  .kpi-label { color:var(--muted); font-size:8px; font-weight:800; letter-spacing:.02em; }
  .kpi-value { margin-top:5px; color:var(--ink); font-size:15px; line-height:1.25; font-weight:950; font-variant-numeric:tabular-nums; }
  .kpi.accent .kpi-value { color:var(--orange); }
  .callout { break-inside:avoid-page; page-break-inside:avoid; position:relative; margin-top:10px; border:1px solid #fed7aa; border-radius:10px; padding:11px 13px 11px 17px; background:linear-gradient(90deg,#fff7ed,#fff); }
  .callout:before { position:absolute; top:10px; bottom:10px; left:7px; width:3px; border-radius:9px; background:#f97316; content:""; }
  .callout .label { color:var(--orange); font-size:9px; font-weight:900; letter-spacing:.06em; }
  .revenue-summary { break-inside:auto; page-break-inside:auto; }
  .periods { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:11px; }
  .period { border:1px solid var(--line); border-radius:9px; padding:9px 11px; background:#fafafa; }
  .period.a { border-left:4px solid #f97316; background:#fffaf5; }
  .period.b { border-left:4px solid #0284c7; background:#f7fcff; }
  .period strong { display:block; margin-top:2px; color:var(--ink); font-size:10.5px; }
  .revenue-cards { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .revenue-card { break-inside:avoid-page; page-break-inside:avoid; border:1px solid var(--line); border-radius:10px; padding:10px 11px; background:#fff; box-shadow:0 1px 0 rgba(24,24,27,.03); }
  .revenue-card.emphasis { grid-column:1 / -1; border-color:#fdba74; background:#fffaf5; }
  .revenue-card:last-child:not(.emphasis) { grid-column:1 / -1; }
  .revenue-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-bottom:7px; border-bottom:1px solid #f0f0f1; }
  .revenue-card-label { color:#27272a; font-size:11px; font-weight:950; }
  .revenue-card-percent { border-radius:99px; padding:3px 8px; background:#f4f4f5; font-size:8.5px; font-weight:900; }
  .revenue-values { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
  .revenue-value small { display:block; color:#a1a1aa; font-size:7.5px; font-weight:800; }
  .revenue-value strong { display:block; margin-top:2px; color:#27272a; font-size:11px; font-weight:950; font-variant-numeric:tabular-nums; }
  .revenue-difference { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; border-radius:7px; padding:6px 8px; background:#fafafa; color:#71717a; font-size:8.5px; font-weight:800; }
  .revenue-difference strong { font-size:10px; font-variant-numeric:tabular-nums; }
  .daily-table-block { margin-top:16px; padding-top:1mm; }
  .daily-subsection { break-inside:auto; page-break-inside:auto; margin-top:13px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .box { break-inside:avoid-page; page-break-inside:avoid; border:1px solid var(--line); border-radius:9px; padding:10px 12px; background:#fff; box-shadow:0 1px 0 rgba(24,24,27,.03); }
  .label { color:var(--muted); font-size:8.5px; font-weight:900; letter-spacing:.02em; }
  .value { margin-top:4px; color:#3f3f46; white-space:pre-wrap; }
  table { width:100%; overflow:hidden; border:1px solid var(--line); border-radius:8px; border-collapse:separate; border-spacing:0; font-size:9.2px; }
  thead { display:table-header-group; }
  tr, img { break-inside:avoid-page; page-break-inside:avoid; }
  tbody tr:nth-child(even) { background:#fafafa; }
  th, td { border-bottom:1px solid var(--line); padding:6px 7px; text-align:left; vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  th { background:#27272a; color:#f4f4f5; font-size:8px; font-weight:850; letter-spacing:.025em; }
  td:first-child { color:#3f3f46; font-weight:700; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .comparison-table { table-layout:fixed; }
  .comparison-table th:first-child { width:17%; }
  .compare-date { font-size:8.8px; line-height:1.45; }
  .compare-date span { display:block; white-space:nowrap; }
  .compare-date .current { color:#c2410c; font-weight:900; }
  .compare-date .previous { color:#0369a1; font-weight:800; }
  .compare-cell { text-align:right; font-size:9px; line-height:1.45; font-variant-numeric:tabular-nums; }
  .compare-cell span { display:block; white-space:nowrap; }
  .compare-cell i { display:inline-block; min-width:1.7em; margin-right:2px; color:#a1a1aa; font-size:.82em; font-style:normal; font-weight:900; text-align:left; }
  .compare-cell .current { color:#27272a; font-weight:900; }
  .compare-cell .previous { color:#71717a; }
  .compare-cell .difference { margin-top:2px; border-top:1px solid #eeeeef; padding-top:2px; font-weight:900; }
  .comparison-note { margin:4px 0 8px; color:#71717a; font-size:9px; }
  body.density-balanced .compare-date { font-size:8.5px; }
  body.density-balanced .compare-cell { font-size:8.7px; }
  body.density-dense .compare-date { font-size:8.2px; }
  body.density-dense .compare-cell { font-size:8.35px; }
  .up { color:var(--green); font-weight:900; }
  .down { color:#be123c; font-weight:900; }
  .photos { break-inside:auto; page-break-inside:auto; margin-top:10px; padding-top:2px; }
  .photo-row { break-inside:avoid-page; page-break-inside:avoid; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:8px; }
  .photo-row.photos-single { grid-template-columns:1fr; }
  .photo-card { min-width:0; margin:0; overflow:hidden; border:1px solid var(--line); border-radius:8px; background:#fafafa; }
  .photo-frame { display:flex; height:138px; align-items:center; justify-content:center; padding:6px; background:#f6f6f7; }
  .photos-single .photo-frame { height:230px; }
  .photo-card img { display:block; width:100%; height:100%; border:0; border-radius:5px; background:#f6f6f7; object-fit:contain; object-position:center; }
  .photo-card figcaption { border-top:1px solid #eeeeef; padding:5px 7px; background:#fff; color:#a1a1aa; font-size:7.5px; font-weight:700; text-align:center; }
  .action { break-inside:auto; page-break-inside:auto; margin-bottom:12px; overflow:visible; border:1px solid var(--line); border-left:4px solid #f97316; border-radius:10px; padding:12px 13px; background:#fff; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
  .action.done { border-color:#a7f3d0; border-left-color:#10b981; background:#fbfffd; }
  .action.dropped { border-color:#d4d4d8; border-left-color:#a1a1aa; background:#fafafa; }
  .action-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .action-head { break-inside:avoid-page; page-break-inside:avoid; }
  .action-title { color:var(--ink); font-size:12px; line-height:1.45; font-weight:950; }
  .action-meta { margin-top:3px; color:var(--muted); font-size:9px; }
  .status-pill { flex:0 0 auto; border-radius:99px; padding:3px 8px; background:#fff7ed; color:#c2410c; font-size:8px; font-weight:900; }
  .done .status-pill { background:var(--green-soft); color:var(--green); }
  .action-detail { break-inside:avoid-page; page-break-inside:avoid; display:grid; grid-template-columns:1fr; gap:7px; margin-top:9px; }
  .action-detail > div { border:1px solid #eeeeef; border-radius:8px; padding:8px 9px; background:#fafafa; white-space:pre-wrap; }
  .empty { break-inside:avoid-page; page-break-inside:avoid; margin:0; border:1px dashed #d4d4d8; border-radius:8px; padding:15px; background:#fafafa; color:#a1a1aa; text-align:center; font-weight:700; }
    </style>
</head>
<body class="density-${density}">
  <header class="cover">
    <div class="brand"><span class="brand-name">雙週營運檢討</span><span class="status">● ${report.status === 'submitted' ? '正式提交' : '草稿預覽'}</span></div>
    <div class="cover-kicker">內部營運管理文件</div>
    <h1>${escapeHtml(storeName)}｜雙週店務會議報告</h1>
    <p class="cover-subtitle">彙整營業表現、顧客回饋、人員觀察與改善行動，作為本次會議決策及下期追蹤依據。</p>
    <div class="cover-meta">
      <div><small>會議日期</small><strong>${escapeHtml(stringValue(report.meeting_date) || stringValue(report.period_end))}</strong></div>
      <div><small>本期報告區間</small><strong>${escapeHtml(stringValue(report.period_start))} - ${escapeHtml(stringValue(report.period_end))}</strong></div>
      <div><small>前期比較區間</small><strong>${escapeHtml(stringValue(report.comparison_period_start))} - ${escapeHtml(stringValue(report.comparison_period_end))}</strong></div>
    </div>
  </header>

  <section>
    ${sectionHeading('01', '營運分析', '營運分析')}
    <div class="kpis">
      <div class="kpi accent"><div class="kpi-label">本期營業額</div><div class="kpi-value">${comparison ? formatMoney(comparison.current.total) : '—'}</div></div>
      <div class="kpi"><div class="kpi-label">本期較前期</div><div class="kpi-value">${totalChange}</div></div>
      <div class="kpi"><div class="kpi-label">改善完成</div><div class="kpi-value">${completedActions} / ${carryItems.length}</div></div>
      <div class="kpi"><div class="kpi-label">本次提案</div><div class="kpi-value">${thisItems.length} 項</div></div>
    </div>
    <div class="callout"><div class="label">營業額分析</div><div class="value">${formatText(stringValue(report.revenue_difference_note) || plainText(stringValue(report.operations_review_html)) || '尚未填寫')}</div></div>
  </section>

  <section class="page-start">
    <h3>營運分析｜兩期營業額與通路差異</h3>
    <div class="revenue-summary">
      <div class="periods"><div class="period a"><span class="label">本期區間</span><strong>${escapeHtml(stringValue(report.period_start))} → ${escapeHtml(stringValue(report.period_end))}</strong></div><div class="period b"><span class="label">前期區間</span><strong>${escapeHtml(stringValue(report.comparison_period_start))} → ${escapeHtml(stringValue(report.comparison_period_end))}</strong></div></div>
      ${revenueRows.length ? `<div class="revenue-cards">${revenueRows.map(row => `<article class="revenue-card ${row.emphasized ? 'emphasis' : ''}"><div class="revenue-card-head"><span class="revenue-card-label">${escapeHtml(row.label)}</span><span class="revenue-card-percent ${row.difference >= 0 ? 'up' : 'down'}">${escapeHtml(row.percentage)}</span></div><div class="revenue-values"><div class="revenue-value"><small>本期金額</small><strong>${formatMoney(row.current)}</strong></div><div class="revenue-value"><small>前期金額</small><strong>${formatMoney(row.previous)}</strong></div></div><div class="revenue-difference"><span>兩期差異金額</span><strong class="${row.difference >= 0 ? 'up' : 'down'}">${formatSignedMoney(row.difference)}</strong></div></article>`).join('')}</div>` : '<p class="empty">沒有可顯示的營業資料</p>'}
    </div>
  </section>
  ${comparison ? `<section class="daily-table-block"><h3>每日營業額差異比較</h3>${dailyRevenueComparisonHtml(comparison)}</section>` : ''}

  <section class="page-start">
    ${sectionHeading(customerSectionNumber, '顧客回饋', '網路評論與客訴')}
    <div class="grid">
      <div class="box"><div class="label">網路評論</div><div class="value">新增 ${numberValue(google.new_reviews)} 則｜平均 ${google.average_rating == null ? '—' : numberValue(google.average_rating)} 星${googleReviews.length ? '' : `<br/>${formatText(stringValue(google.summary) || '無')}`}</div></div>
      <div class="box"><div class="label">客訴紀錄</div><div class="value">共 ${numberValue(complaint.count)} 件｜${escapeHtml(stringValue(complaint.category) || '未分類')}${complaints.length ? '' : `<br/>${formatText(stringValue(complaint.description) || '無')}<br/><strong>處理結果：</strong>${formatText(stringValue(complaint.resolution) || '無')}`}</div></div>
    </div>
    ${googleReviews.length ? `<h3>每則評論與店家說明</h3>${googleReviews.map((review, index) => `<div class="action"><div class="action-head"><div><div class="action-title">網路評論 ${index + 1}</div><div class="action-meta">顧客聲音與店家回應</div></div><span class="status-pill">${review.rating == null ? '—' : numberValue(review.rating)} 星</span></div><div class="action-detail"><div><span class="label">評論內容</span><br/>${formatText(stringValue(review.comment) || '未填寫')}</div><div><span class="label">店家說明／改善方式</span><br/>${formatText(stringValue(review.explanation) || '未填寫')}</div></div></div>${photoHtml(stringArray(review.photos))}`).join('')}` : ''}
    ${complaints.length ? `<h3>每筆客訴與處理結果</h3>${complaints.map((item, index) => `<div class="action"><div class="action-head"><div><div class="action-title">客訴紀錄 ${index + 1}</div><div class="action-meta">問題與後續處理</div></div><span class="status-pill">${escapeHtml(stringValue(item.category) || '未分類')}</span></div><div class="action-detail"><div><span class="label">問題說明</span><br/>${formatText(stringValue(item.description) || '未填寫')}</div><div><span class="label">處理結果</span><br/>${formatText(stringValue(item.resolution) || '未填寫')}</div></div></div>${photoHtml(stringArray(item.photos))}`).join('')}` : ''}
  </section>

  ${hasVendorSection ? `<section>
    ${sectionHeading(vendorSectionNumber!, '供貨品質', '廠商供貨品質及問題')}
    ${vendors.length ? `<table><thead><tr><th>廠商</th><th>品項</th><th>問題說明</th><th>處理狀況</th></tr></thead><tbody>${vendors.map(issue => `<tr><td>${escapeHtml(stringValue(issue.vendor))}</td><td>${escapeHtml(stringValue(issue.item))}</td><td>${formatText(stringValue(issue.issue))}</td><td>${escapeHtml(stringValue(issue.status))}</td></tr>`).join('')}</tbody></table>` : ''}
    ${photoHtml(productPhotos)}
  </section>` : ''}

  ${hasStaffSection ? `<section>
    ${sectionHeading(staffSectionNumber!, '人員觀察', '個別同仁分析報告')}
    ${staffMembers.map((member, index) => staffMemberHtml(member, index)).join('')}
  </section>` : ''}

  ${hasCarrySection ? `<section>
    ${sectionHeading(carrySectionNumber!, '進度追蹤', '上次問題處理與改善進度')}
    ${carryItems.map(item => actionHtml(item, 'progress')).join('')}
  </section>` : ''}

  ${hasProposalSection ? `<section>
    ${sectionHeading(proposalSectionNumber!, '問題與解法', '本次主動提出問題與解法')}
    ${thisItems.map(item => actionHtml(item, 'proposal')).join('')}
  </section>` : ''}
</body>
</html>`
}

function actionHtml(item: Record<string, unknown>, mode: 'progress' | 'proposal') {
  const details = objectValue(item.details)
  const status = stringValue(item.status)
  const statusText = status === 'open' ? '進行中' : '已完成'
  const initialTracking = Boolean(details.is_initial_tracking)
  return `<div class="action ${status === 'resolved' ? 'done' : status === 'dropped' ? 'dropped' : ''}">
    <div class="action-head"><div><div class="action-title">${escapeHtml(stringValue(details.observation) || stringValue(item.description) || '未命名事項')}</div><div class="action-meta">提出人：${escapeHtml(stringValue(details.proposer_name) || '—')}${mode === 'progress' ? `　·　目前進度 ${numberValue(item.progress_percent)}%` : ''}</div></div>${mode === 'progress' ? `<span class="status-pill">${statusText}</span>` : '<span class="status-pill">本次提案</span>'}</div>
    <div class="action-detail">
      ${mode === 'proposal' || initialTracking ? `${detailCell('觀察到的問題', stringValue(details.observation))}${detailCell('預計處理方式', stringValue(details.solution))}${mode === 'progress' ? `${detailCell('本期改善進度', stringValue(item.progress_note))}${detailCell('處理結論', stringValue(item.resolution_note))}` : ''}` : `${detailCell('本期改善進度', stringValue(item.progress_note))}${detailCell('遇到的困難', stringValue(item.difficulty_note))}${detailCell('處理結論', stringValue(item.resolution_note))}`}
    </div>
  </div>${photoHtml(stringArray(item.photos))}`
}

function staffMemberHtml(member: Record<string, unknown>, index: number) {
  const performanceNotes = [stringValue(member.strengths).trim(), stringValue(member.concerns).trim()].filter(Boolean).join('\n')
  return `<div class="action ${stringValue(member.current_status) === '表現良好' ? 'done' : ''}">
    <div class="action-head"><div><div class="action-title">${index + 1}. ${escapeHtml(stringValue(member.name) || '未填姓名')}</div><div class="action-meta">個別同仁觀察與後續安排</div></div><span class="status-pill">${escapeHtml(stringValue(member.current_status) || '未填狀況')}</span></div>
    <div class="action-detail">
      ${detailCell('表現亮點／需要改善與觀察', performanceNotes)}
      ${detailCell('預計處理方式', stringValue(member.action_plan))}
    </div>
  </div>`
}

function detailCell(label: string, value: string) {
  return `<div><span class="label">${label}</span><br/>${formatText(value || '—')}</div>`
}

function sectionHeading(number: string, eyebrow: string, title: string) {
  return `<div class="section-heading"><span class="section-number">${escapeHtml(number)}</span><div><div class="section-eyebrow">${escapeHtml(eyebrow)}</div><h2>${escapeHtml(title)}</h2></div></div>`
}

function dailyRevenueComparisonHtml(comparison: MeetingRevenueComparison) {
  const rows = buildPdfDailyComparisonRows(comparison.current.daily, comparison.previous.daily)
  const overviewMetrics: Array<[string, PdfDailyMetric]> = [
    ['總營業額', 'total'],
    ['現場', 'onsite'],
    ['外送合計', 'deliveryTotal'],
    ...(comparison.channels.online
      ? [['線上點餐', 'online'] as [string, PdfDailyMetric]]
      : []),
  ]
  const deliveryMetrics: Array<[string, PdfDailyMetric]> = [
    ...(comparison.channels.uber
      ? [['優步外送', 'uber'] as [string, PdfDailyMetric]]
      : []),
    ...(comparison.channels.panda
      ? [['熊貓外送', 'panda'] as [string, PdfDailyMetric]]
      : []),
    ['店內外送', 'storeDelivery'],
  ]

  return `<p class="comparison-note">每列依兩個區間的相同日序配對；各欄依序顯示「本期、前期、差額與變動率」，金額單位為新台幣。正成長以綠色、下降以紅色標示。</p>${dailyComparisonTable('每日營業總覽比較', rows, overviewMetrics)}${dailyComparisonTable('每日外送平台比較', rows, deliveryMetrics)}`
}

function dailyComparisonTable(
  title: string,
  rows: ReturnType<typeof buildPdfDailyComparisonRows>,
  metrics: Array<[string, PdfDailyMetric]>,
) {
  const body = rows.map(row => `<tr>${comparisonDateCell(row.sequence, row.current?.date, row.previous?.date)}${metrics.map(([, key]) => comparisonValueCell(row.current, row.previous, key)).join('')}</tr>`).join('')
  return `<div class="daily-subsection"><h4>${escapeHtml(title)}</h4><table class="comparison-table"><thead><tr><th>比較日</th>${metrics.map(([label]) => `<th class="num">${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`
}

function comparisonDateCell(sequence: number, currentDate?: string, previousDate?: string) {
  return `<td class="compare-date"><strong>第 ${sequence} 日</strong><span class="current">本期 ${escapeHtml(shortDate(currentDate))}</span><span class="previous">前期 ${escapeHtml(shortDate(previousDate))}</span></td>`
}

function comparisonValueCell(
  current: ReturnType<typeof buildPdfDailyComparisonRows>[number]['current'],
  previous: ReturnType<typeof buildPdfDailyComparisonRows>[number]['previous'],
  key: PdfDailyMetric,
) {
  const currentValue = current?.hasData && typeof current[key] === 'number' ? Number(current[key]) : null
  const previousValue = previous?.hasData && typeof previous[key] === 'number' ? Number(previous[key]) : null
  if (currentValue == null && previousValue == null) return '<td class="compare-cell">—</td>'
  const difference = (currentValue ?? 0) - (previousValue ?? 0)
  const percentage = currentValue == null || previousValue == null ? '—' : formatChange(currentValue, previousValue)
  return `<td class="compare-cell"><span class="current"><i>本期</i>${currentValue == null ? '—' : formatPlainAmount(currentValue)}</span><span class="previous"><i>前期</i>${previousValue == null ? '—' : formatPlainAmount(previousValue)}</span><span class="difference ${difference >= 0 ? 'up' : 'down'}"><i>差額</i>${formatSignedPlainAmount(difference)} · ${escapeHtml(percentage)}</span></td>`
}

type PdfDailyMetric = Exclude<keyof PdfDailyRevenueRow, 'date' | 'hasData'>

function shortDate(value?: string) {
  if (!value) return '—'
  const parts = value.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value
}

function photoHtml(photos: string[]) {
  if (!photos.length) return ''
  const rows: string[] = []
  for (let index = 0; index < photos.length; index += 2) {
    const row = photos.slice(index, index + 2)
    const rowClass = photos.length === 1 ? photoGridClass(1).replace('photos', '').trim() : ''
    rows.push(`<div class="photo-row ${rowClass}">${row.map((url, rowIndex) => `<figure class="photo-card"><div class="photo-frame"><img src="${escapeHtml(url)}" alt="附件照片 ${index + rowIndex + 1}" /></div><figcaption>附件照片 ${index + rowIndex + 1}</figcaption></figure>`).join('')}</div>`)
  }
  return `<div class="photos">${rows.join('')}</div>`
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

function formatSignedMoney(value: number) {
  if (value === 0) return 'NT$ 0'
  return `${value > 0 ? '+' : '-'}NT$ ${Math.abs(Math.round(value)).toLocaleString('zh-TW')}`
}

function formatPlainAmount(value: number) {
  return Math.round(value).toLocaleString('zh-TW')
}

function formatSignedPlainAmount(value: number) {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '-'}${Math.abs(Math.round(value)).toLocaleString('zh-TW')}`
}

function formatChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? '本期新增' : '—'
  const value = ((current - previous) / previous) * 100
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}
