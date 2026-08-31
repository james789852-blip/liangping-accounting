'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react'
import type {
  ActionItem,
  DailyRevenueSummary,
  MeetingReport,
  MeetingRevenueComparison,
  StaffMemberAnalysis,
} from '@/app/actions/meeting-reports'

interface Props {
  report: MeetingReport
  storeName: string
  comparison: MeetingRevenueComparison | null
  proposals: ActionItem[]
  carryItems: ActionItem[]
  pending: boolean
  onExportPdf: () => void
  onUnsubmit: () => void
}

const NAV_ITEMS = [
  ['overview', '營運分析'],
  ['operations', '營運回顧'],
  ['staff', '同仁分析'],
  ['improvements', '改善追蹤'],
  ['proposals', '問題與解法'],
] as const

function money(value: number) {
  return `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
}

function signedMoney(value: number) {
  if (value === 0) return 'NT$ 0'
  return `${value > 0 ? '+' : '-'}NT$ ${Math.abs(Math.round(value)).toLocaleString('zh-TW')}`
}

function formatDate(value: string | null | undefined) {
  return value ? value.replaceAll('-', '/') : '—'
}

function change(current: number, previous: number) {
  if (previous === 0) return { text: current > 0 ? '本期新增' : '—', positive: null as boolean | null }
  const value = ((current - previous) / previous) * 100
  return { text: `${value > 0 ? '+' : ''}${value.toFixed(1)}%`, positive: value >= 0 }
}

export default function SubmittedReportView({
  report,
  storeName,
  comparison,
  proposals,
  carryItems,
  pending,
  onExportPdf,
  onUnsubmit,
}: Props) {
  const totalChange = comparison ? change(comparison.current.total, comparison.previous.total) : null
  const completedItems = carryItems.filter(item => item.status === 'resolved').length

  return (
    <div className="min-h-full bg-[#f4f2ee] pb-20 text-zinc-900">
      <header className="relative overflow-hidden bg-[#161616] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(249,115,22,.26),transparent_34%),radial-gradient(circle_at_15%_80%,rgba(255,255,255,.07),transparent_28%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-7 lg:px-8 lg:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/manager/meeting-report" className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 transition hover:text-white"><ArrowLeft className="h-4 w-4" />返回會議總覽</Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" />正式提交</span>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-bold tracking-[.22em] text-orange-400">雙週營運會議報告</p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{storeName}｜雙週店務會議報告</h1>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
                <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-orange-400" />會議日期 {formatDate(report.meeting_date)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onExportPdf} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-400"><Download className="h-4 w-4" />匯出正式 PDF</button>
              <button type="button" onClick={onUnsubmit} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-50"><RotateCcw className="h-4 w-4" />取消提交並編輯</button>
            </div>
          </div>
        </div>
      </header>

      <nav className="sticky top-14 z-20 border-b border-black/5 bg-[#f4f2ee]/95 backdrop-blur lg:top-0">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 lg:px-8">
          {NAV_ITEMS.map(([id, label], index) => <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-zinc-500 transition hover:bg-white hover:text-orange-600"><span className="mr-1.5 text-zinc-300">0{index + 1}</span>{label}</a>)}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 lg:px-8">
        <ReportSection id="overview" title="營運分析" icon={<Sparkles className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <RevenueComparisonMetric comparison={comparison} totalChange={totalChange} />
            <Metric label="網路評論" value={`${report.google_review_data.new_reviews} 則`} />
            <Metric label="客訴" value={`${report.complaint_data.count} 件`} />
            <Metric label="改善完成" value={`${completedItems} / ${carryItems.length}`} />
            <Metric label="本次提案" value={`${proposals.length} 項`} />
          </div>
          <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/70 p-5">
            <p className="text-xs font-extrabold tracking-widest text-orange-600">營業額分析</p>
            <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-zinc-800">{report.revenue_difference_note || '本次尚未填寫營業額分析'}</p>
          </div>
          <div className="mt-7 border-t border-zinc-100 pt-7">
            <Subheading title="兩期營業額與通路差異" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <PeriodCard tone="orange" label="本期（報告區間）" start={report.period_start} end={report.period_end} total={comparison?.current.total} />
            <PeriodCard tone="sky" label="前期（比較區間）" start={report.comparison_period_start} end={report.comparison_period_end} total={comparison?.previous.total} />
          </div>
          {comparison ? <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ChannelCard label="總營業額" current={comparison.current.total} previous={comparison.previous.total} />
              <ChannelCard label="現場" current={comparison.current.onsite} previous={comparison.previous.onsite} />
              {comparison.channels.uber && <ChannelCard label="優步外送" current={comparison.current.uber} previous={comparison.previous.uber} />}
              {comparison.channels.panda && <ChannelCard label="熊貓外送" current={comparison.current.panda} previous={comparison.previous.panda} />}
              <ChannelCard label="店內外送" current={comparison.current.storeDelivery} previous={comparison.previous.storeDelivery} />
              <ChannelCard label="外送合計" current={comparison.current.deliveryTotal} previous={comparison.previous.deliveryTotal} />
              {comparison.channels.online && <ChannelCard label="線上點餐" current={comparison.current.online} previous={comparison.previous.online} />}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <DailyTable title="本期｜每日營業額" tone="orange" rows={comparison.current.daily} channels={comparison.channels} />
              <DailyTable title="前期｜每日營業額" tone="sky" rows={comparison.previous.daily} channels={comparison.channels} />
            </div>
          </> : <Empty text="目前沒有可顯示的營業資料" />}
        </ReportSection>

        <ReportSection id="operations" title="營運回顧" icon={<MessageSquareText className="h-5 w-5" />}>
          <div className="grid gap-4 lg:grid-cols-2">
            <GoogleReviewsCard data={report.google_review_data} />
            <ComplaintsCard data={report.complaint_data} />
          </div>
          <div className="mt-5">
            <Subheading title="廠商供貨品質及問題" count={report.vendor_issues.length} />
            {report.vendor_issues.length ? <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200"><table className="w-full text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-3 text-left">廠商</th><th className="p-3 text-left">品項</th><th className="p-3 text-left">問題</th><th className="p-3 text-left">狀態</th></tr></thead><tbody>{report.vendor_issues.map(issue => <tr key={issue.id} className="border-t border-zinc-100"><td className="p-3 font-bold">{issue.vendor || '—'}</td><td className="p-3">{issue.item || '—'}</td><td className="p-3">{issue.issue || '—'}</td><td className="p-3"><StatusPill text={issue.status} /></td></tr>)}</tbody></table></div> : <Empty text="本期無供貨問題" />}
            <PhotoStrip photos={report.product_quality_photos} />
          </div>
        </ReportSection>

        <ReportSection id="staff" title="個別同仁分析報告" icon={<UserRound className="h-5 w-5" />}>
          <div className="grid gap-4 lg:grid-cols-2">
            {report.staff_members.map((member, index) => <StaffCard key={member.id} member={member} index={index} />)}
          </div>
          {report.staff_members.length === 0 && <Empty text="本期沒有個別同仁分析" />}
        </ReportSection>

        <ReportSection id="improvements" title="上次問題處理與改善進度" icon={<ClipboardCheck className="h-5 w-5" />}>
          <div className="space-y-4">{carryItems.map((item, index) => <ActionReview key={item.id} item={item} index={index} mode="progress" />)}</div>
          {carryItems.length === 0 && <Empty text="目前沒有上次結轉事項" />}
        </ReportSection>

        <ReportSection id="proposals" title="本次主動提出問題與解法" icon={<Target className="h-5 w-5" />}>
          <div className="space-y-4">{proposals.map((item, index) => <ActionReview key={item.id} item={item} index={index} mode="proposal" />)}</div>
          {proposals.length === 0 && <Empty text="本次沒有問題提案" />}
        </ReportSection>
      </main>
    </div>
  )
}

function ReportSection({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-28 rounded-[28px] border border-black/[.06] bg-white p-5 shadow-[0_18px_50px_rgba(24,24,27,.06)] sm:p-7"><div className="mb-6 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-orange-400">{icon}</span><h2 className="text-xl font-black tracking-tight text-zinc-900 sm:text-2xl">{title}</h2></div>{children}</section>
}

function RevenueComparisonMetric({ comparison, totalChange }: { comparison: MeetingRevenueComparison | null; totalChange: ReturnType<typeof change> | null }) {
  if (!comparison) return <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4 sm:col-span-2 xl:col-span-2"><p className="text-xs font-bold text-zinc-500">本期與前期營業額</p><p className="mt-2 text-lg font-black text-zinc-400">尚無比較資料</p></div>
  const difference = comparison.current.total - comparison.previous.total
  const trendColor = totalChange?.positive === false ? 'text-rose-600' : totalChange?.positive === true ? 'text-emerald-600' : 'text-zinc-500'
  return <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 sm:col-span-2 xl:col-span-2">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold text-orange-700">本期與前期營業額比較</p><span className={`text-xs font-extrabold ${trendColor}`}>較前期 {totalChange?.text ?? '—'}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div><p className="text-[11px] font-bold text-zinc-400">本期營業額</p><p className="mt-1 text-lg font-black tabular-nums text-orange-600">{money(comparison.current.total)}</p></div>
      <div><p className="text-[11px] font-bold text-zinc-400">前期營業額</p><p className="mt-1 text-lg font-black tabular-nums text-sky-700">{money(comparison.previous.total)}</p></div>
    </div>
    <div className="mt-3 border-t border-orange-100 pt-2 text-xs font-bold text-zinc-500">金額差異 <span className={`ml-1 tabular-nums ${trendColor}`}>{signedMoney(difference)}</span></div>
  </div>
}

function Metric({ label, value, accent = false, tone }: { label: string; value: string; accent?: boolean; tone?: 'positive' | 'negative' }) {
  const valueColor = tone === 'negative' ? 'text-rose-600' : tone === 'positive' ? 'text-emerald-600' : accent ? 'text-orange-600' : 'text-zinc-900'
  return <div className={`rounded-2xl border p-4 ${accent ? 'border-orange-100 bg-orange-50/60' : 'border-zinc-100 bg-zinc-50/70'}`}><p className="text-xs font-bold text-zinc-500">{label}</p><p className={`mt-2 text-lg font-black tabular-nums ${valueColor}`}>{value}</p></div>
}

function PeriodCard({ tone, label, start, end, total }: { tone: 'orange' | 'sky'; label: string; start: string; end: string; total?: number }) {
  return <div className={`rounded-2xl border p-5 ${tone === 'orange' ? 'border-orange-200 bg-orange-50/50' : 'border-sky-200 bg-sky-50/50'}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-xs font-extrabold uppercase tracking-wider ${tone === 'orange' ? 'text-orange-600' : 'text-sky-600'}`}>{label}</p><p className="mt-2 text-sm font-bold text-zinc-700">{formatDate(start)} → {formatDate(end)}</p></div><p className="text-xl font-black tabular-nums text-zinc-900">{total === undefined ? '—' : money(total)}</p></div></div>
}

function ChannelCard({ label, current, previous }: { label: string; current: number; previous: number }) {
  const delta = change(current, previous)
  const TrendIcon = delta.positive === false ? ArrowDownRight : ArrowUpRight
  const trendColor = delta.positive === false ? 'text-rose-600' : delta.positive === true ? 'text-emerald-600' : 'text-zinc-500'
  return <div className="rounded-2xl border border-zinc-100 p-4"><p className="text-xs font-extrabold text-zinc-700">{label}</p><div className="mt-3 space-y-2"><div className="flex items-end justify-between gap-2"><span className="text-[11px] font-bold text-orange-600">本期</span><span className="text-base font-black tabular-nums text-zinc-900">{money(current)}</span></div><div className="flex items-end justify-between gap-2"><span className="text-[11px] font-bold text-sky-600">前期</span><span className="text-sm font-bold tabular-nums text-zinc-600">{money(previous)}</span></div></div><div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px]"><span className="font-bold text-zinc-400">差額 {signedMoney(current - previous)}</span><span className={`inline-flex items-center gap-1 font-extrabold ${trendColor}`}><TrendIcon className="h-3.5 w-3.5" />較前期 {delta.text}</span></div></div>
}

function DailyTable({ title, tone, rows, channels }: { title: string; tone: 'orange' | 'sky'; rows: DailyRevenueSummary[]; channels: MeetingRevenueComparison['channels'] }) {
  const valueColumns = 4 + Number(channels.uber) + Number(channels.panda) + Number(channels.online)
  return <div className="overflow-hidden rounded-2xl border border-zinc-200"><div className={`px-4 py-3 ${tone === 'orange' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700'}`}><p className="text-sm font-extrabold">{title}</p></div><div className="max-h-[430px] overflow-auto"><table className="w-full min-w-[760px] text-xs"><thead className="sticky top-0 bg-zinc-50 text-zinc-500"><tr><th className="p-2.5 text-left">日期</th><th className="p-2.5 text-right">總額</th><th className="p-2.5 text-right">現場</th>{channels.uber && <th className="p-2.5 text-right">優步外送</th>}{channels.panda && <th className="p-2.5 text-right">熊貓外送</th>}<th className="p-2.5 text-right">店內外送</th><th className="p-2.5 text-right">外送合計</th>{channels.online && <th className="p-2.5 text-right">線上點餐</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.date} className="border-t border-zinc-100"><td className="p-2.5 font-bold">{formatDate(row.date)}</td>{row.hasData ? <><NumberCell value={row.total} strong /><NumberCell value={row.onsite} />{channels.uber && <NumberCell value={row.uber} />}{channels.panda && <NumberCell value={row.panda} />}<NumberCell value={row.storeDelivery} /><NumberCell value={row.deliveryTotal} strong />{channels.online && <NumberCell value={row.online} />}</> : <td colSpan={valueColumns} className="p-2.5 text-center text-zinc-400">尚無資料</td>}</tr>)}</tbody></table></div></div>
}

function NumberCell({ value, strong = false }: { value: number; strong?: boolean }) {
  return <td className={`p-2.5 text-right tabular-nums ${strong ? 'font-extrabold text-zinc-900' : 'text-zinc-600'}`}>{Math.round(value).toLocaleString('zh-TW')}</td>
}

function GoogleReviewsCard({ data }: { data: MeetingReport['google_review_data'] }) {
  return <article className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-5"><p className="text-xs font-extrabold tracking-wider text-orange-600">網路評論</p><p className="mt-2 text-lg font-black">新增 {data.new_reviews} 則・平均 {data.average_rating ?? '—'} 星</p>{data.reviews.length > 0 ? <div className="mt-4 space-y-3">{data.reviews.map((review, index) => <div key={review.id} className="rounded-xl border border-zinc-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold text-zinc-800">評論 {index + 1}</p><span className="text-xs font-bold text-amber-600">{review.rating ?? '—'} 星</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{review.comment || '未填寫評論內容'}</p><p className="mt-3 border-t border-zinc-100 pt-3 text-sm font-semibold leading-6 text-zinc-700"><span className="text-zinc-400">店家說明：</span>{review.explanation || '未填寫'}</p><PhotoStrip photos={review.photos} /></div>)}</div> : <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{data.summary || '本期無特別回饋'}</p>}</article>
}

function ComplaintsCard({ data }: { data: MeetingReport['complaint_data'] }) {
  return <article className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-5"><p className="text-xs font-extrabold uppercase tracking-wider text-orange-600">客訴紀錄</p><p className="mt-2 text-lg font-black">共 {data.count} 件・{data.category || '未分類'}</p>{data.complaints.length > 0 ? <div className="mt-4 space-y-3">{data.complaints.map((complaint, index) => <div key={complaint.id} className="rounded-xl border border-zinc-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold text-zinc-800">客訴 {index + 1}</p><span className="text-xs font-bold text-orange-600">{complaint.category || '未分類'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{complaint.description || '未填寫問題說明'}</p><p className="mt-3 border-t border-zinc-100 pt-3 text-sm font-semibold leading-6 text-zinc-700"><span className="text-zinc-400">處理結果：</span>{complaint.resolution || '未填寫'}</p><PhotoStrip photos={complaint.photos} /></div>)}</div> : <><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{data.description || '本期無客訴'}</p>{data.resolution && <p className="mt-3 border-t border-zinc-200 pt-3 text-sm font-semibold text-zinc-700">處理結果：{data.resolution}</p>}</>}</article>
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"><p className="text-xs font-bold text-zinc-400">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-700">{value}</p></div>
}

function StaffCard({ member, index }: { member: StaffMemberAnalysis; index: number }) {
  const performanceNotes = [member.strengths.trim(), member.concerns.trim()].filter(Boolean).join('\n')
  return <article className="overflow-hidden rounded-2xl border border-zinc-200"><div className="flex items-center justify-between bg-zinc-900 px-4 py-3 text-white"><div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-black">{index + 1}</span><p className="font-extrabold">{member.name || '未填姓名'}</p></div><StatusPill text={member.current_status} dark /></div><div className="grid gap-3 p-4 sm:grid-cols-2"><InfoBlock label="表現亮點／需要改善與觀察" value={performanceNotes || '—'} /><InfoBlock label="預計處理方式" value={member.action_plan || '—'} /></div></article>
}

function ActionReview({ item, index, mode }: { item: ActionItem; index: number; mode: 'progress' | 'proposal' }) {
  const details = item.details
  const initialTracking = Boolean(details.is_initial_tracking)
  return <article className="rounded-2xl border border-zinc-200 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-xs font-black text-orange-700">{index + 1}</span><div><h3 className="font-black text-zinc-900">{details.observation || item.description || '未命名事項'}</h3>{!initialTracking && <p className="mt-1 text-xs text-zinc-400">提出人 {details.proposer_name || '—'}</p>}</div></div>
      {mode === 'progress' && <StatusPill text={item.status === 'open' ? '進行中' : '已完成'} />}
    </div>
    {mode === 'progress' && <div className="mt-4"><div className="mb-1 flex justify-between text-xs font-bold text-zinc-500"><span>改善進度</span><span>{item.progress_percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600" style={{ width: `${item.progress_percent}%` }} /></div></div>}
    <div className={`mt-4 grid gap-3 md:grid-cols-2 ${mode === 'progress' && !initialTracking ? 'xl:grid-cols-3' : ''}`}>
      {mode === 'proposal' || initialTracking ? <><InfoBlock label="觀察到的問題" value={details.observation || '—'} /><InfoBlock label="預計處理方式" value={details.solution || '—'} />{mode === 'progress' && <><InfoBlock label="目前處理狀況" value={item.progress_note || '—'} /><InfoBlock label="本次處理結論" value={item.resolution_note || '—'} /></>}</> : <><InfoBlock label="目前處理狀況" value={item.progress_note || '—'} /><InfoBlock label="遇到的困難" value={item.difficulty_note || '—'} /><InfoBlock label="本次處理結論" value={item.resolution_note || '—'} /></>}
    </div>
    <PhotoStrip photos={item.photos} />
  </article>
}

function PhotoStrip({ photos }: { photos: string[] }) {
  if (!photos.length) return null
  return <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.map((photo, index) => <div key={`${photo}-${index}`} className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-100"><Image src={photo} alt={`附件 ${index + 1}`} fill unoptimized className="object-cover" /></div>)}</div>
}

function Subheading({ title, count }: { title: string; count?: number }) {
  return <div className="flex items-center justify-between"><h3 className="text-base font-black">{title}</h3>{count !== undefined && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-500">{count} 筆</span>}</div>
}

function StatusPill({ text, dark = false }: { text: string; dark?: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${dark ? 'bg-white/10 text-white/75' : text.includes('完成') || text.includes('良好') ? 'bg-emerald-50 text-emerald-700' : text.includes('關注') ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{text || '—'}</span>
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-9 text-center text-sm font-semibold text-zinc-400">{text}</div>
}
