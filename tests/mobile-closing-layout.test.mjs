import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const globalCss = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const closingForm = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
const managerNav = fs.readFileSync(new URL('../components/manager/nav.tsx', import.meta.url), 'utf8')
const hqNav = fs.readFileSync(new URL('../components/hq/nav.tsx', import.meta.url), 'utf8')
const managerLayout = fs.readFileSync(new URL('../app/manager/layout.tsx', import.meta.url), 'utf8')
const hqLayout = fs.readFileSync(new URL('../app/hq/layout.tsx', import.meta.url), 'utf8')
const rootLayout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const cashCountForm = fs.readFileSync(new URL('../components/manager/cash-count-form.tsx', import.meta.url), 'utf8')
const receiptsClient = fs.readFileSync(new URL('../components/manager/receipts-client.tsx', import.meta.url), 'utf8')
const analyticsClient = fs.readFileSync(new URL('../app/manager/analytics/client.tsx', import.meta.url), 'utf8')
const foodCostPreview = fs.readFileSync(new URL('../components/hq/food-cost-preview-client.tsx', import.meta.url), 'utf8')
const nativeExport = fs.readFileSync(new URL('../components/hq/native-export-client.tsx', import.meta.url), 'utf8')
const reviewCard = fs.readFileSync(new URL('../components/hq/review-card.tsx', import.meta.url), 'utf8')
const notificationCenter = fs.readFileSync(new URL('../components/notification-center.tsx', import.meta.url), 'utf8')

test('closing form constrains its page and content to the mobile viewport', () => {
  assert.match(closingForm, /closing-form-page min-h-full/)
  assert.match(closingForm, /closing-form-content max-w-xl/)
  assert.match(globalCss, /\.closing-form-page[\s\S]*overflow-x: clip/)
  assert.match(globalCss, /\.closing-form-content[\s\S]*max-width: 100%/)
})

test('receipt item controls stack without clipping on mobile', () => {
  assert.equal((closingForm.match(/className="receipt-item-toolbar"/g) ?? []).length, 2)
  assert.equal((closingForm.match(/className="receipt-item-actions"/g) ?? []).length, 2)
  assert.match(globalCss, /@media \(max-width: 768px\)[\s\S]*\.receipt-item-row \{[\s\S]*display: grid/)
  assert.match(globalCss, /\.receipt-item-row > \.receipt-field \{[\s\S]*grid-column: 1 \/ -1/)
  assert.match(globalCss, /\.receipt-item-row > div > input \{[\s\S]*width: 100% !important/)
})

test('receipt grid and every grid child can shrink below native select intrinsic width', () => {
  assert.match(globalCss, /\.receipt-form-fields \{[\s\S]*width: 100%[\s\S]*max-width: 100%/)
  assert.match(globalCss, /\.receipt-form-fields > \* \{[\s\S]*min-width: 0[\s\S]*max-width: 100%/)
  assert.match(globalCss, /@media \(max-width: 768px\)[\s\S]*\.receipt-form-fields \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
  assert.doesNotMatch(globalCss, /@media \(max-width: 768px\)[\s\S]*\.receipt-form-fields \{\s*grid-template-columns: 1fr/)
})

test('manager and HQ shells share a mobile overflow safety boundary', () => {
  assert.match(managerLayout, /app-layout-root/)
  assert.match(managerLayout, /app-content-shell/)
  assert.match(hqLayout, /app-layout-root/)
  assert.match(hqLayout, /app-content-shell/)
  assert.match(globalCss, /\.app-content-shell :where\(\.grid\) > \* \{[\s\S]*min-width: 0/)
})

test('HQ mobile photo review escapes the page scroller and keeps pagination reachable', () => {
  assert.match(reviewCard, /createPortal\(/)
  assert.match(reviewCard, /document\.body/)
  assert.match(reviewCard, /hq-review-dialog-panel/)
  assert.match(reviewCard, /hq-review-dialog-footer shrink-0 grid grid-cols-2/)
  assert.match(globalCss, /\.hq-review-dialog-panel \{[\s\S]*height: 100dvh[\s\S]*max-height: 100dvh/)
  assert.match(globalCss, /\.hq-review-dialog-scroll \{[\s\S]*touch-action: pan-y/)
  assert.match(globalCss, /\.hq-review-dialog-footer \{[\s\S]*safe-area-inset-bottom/)
})

test('manager closing keeps more mobile space for the active step', () => {
  assert.match(closingForm, /closing-form-header bg-white z-50 lg:sticky lg:top-0/)
  assert.doesNotMatch(closingForm, /bg-white sticky top-0 z-50/)
  assert.doesNotMatch(closingForm, /目前正在做：/)
  assert.doesNotMatch(closingForm, /注意：目前正在做/)
  assert.match(closingForm, /toast\.warning\(`目前正在處理 \$\{today\} 的補做帳目，不是今日帳目。`/)
  assert.match(closingForm, /duration: 6000/)
  assert.match(notificationCenter, /bottom-\[calc\(9\.75rem\+env\(safe-area-inset-bottom\)\)\]/)
})

test('daily closing summary stacks complete metadata on narrow screens', () => {
  assert.match(closingForm, /px-4 py-3 sm:px-5/)
  assert.match(closingForm, /min-w-0 break-words text-base font-bold leading-snug/)
  assert.match(closingForm, />帳務日期</)
  assert.match(closingForm, /h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm/)
  assert.match(closingForm, /mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between/)
  assert.match(closingForm, /min-w-0 break-words text-\[11px\] font-medium leading-snug/)
  assert.doesNotMatch(closingForm, /\{store\.name\} · \{today\}/)
})

test('high-density forms use shrinkable grid tracks and wide reports provide local scrolling', () => {
  assert.doesNotMatch(cashCountForm, /gridTemplateColumns: '3\.5rem 1fr 1fr 3\.5rem'/)
  assert.doesNotMatch(receiptsClient, /gridTemplateColumns: '1fr 3rem 2\.5rem 4rem 4rem'/)
  assert.doesNotMatch(analyticsClient, /gridTemplateColumns: '78px 74px 1fr 80px'/)
  assert.match(foodCostPreview, /rounded-2xl overflow-x-auto/)
  assert.match(foodCostPreview, /min-w-\[608px\]/)
  assert.match(nativeExport, /rounded-xl overflow-x-auto/)
  assert.match(nativeExport, /min-w-\[560px\]/)
})

test('narrow mobile header stays inside the viewport and pinch zoom remains available', () => {
  assert.match(managerNav, /manager-mobile-clock/)
  assert.match(hqNav, /hq-mobile-header/)
  assert.match(hqNav, /hq-mobile-actions/)
  assert.match(globalCss, /@media \(max-width: 420px\)[\s\S]*\.manager-mobile-clock[\s\S]*display: none/)
  assert.match(globalCss, /@media \(max-width: 420px\)[\s\S]*\.hq-mobile-header[\s\S]*padding-inline: 10px/)
  assert.match(rootLayout, /maximumScale: 5/)
  assert.match(rootLayout, /userScalable: true/)
})
