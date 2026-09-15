import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const globalCss = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const closingForm = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
const managerNav = fs.readFileSync(new URL('../components/manager/nav.tsx', import.meta.url), 'utf8')
const rootLayout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

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

test('narrow mobile header stays inside the viewport and pinch zoom remains available', () => {
  assert.match(managerNav, /manager-mobile-clock/)
  assert.match(globalCss, /@media \(max-width: 420px\)[\s\S]*\.manager-mobile-clock[\s\S]*display: none/)
  assert.match(rootLayout, /maximumScale: 5/)
  assert.match(rootLayout, /userScalable: true/)
})
