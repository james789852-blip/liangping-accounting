'use client'

import type { CSSProperties, ReactNode } from 'react'

export default function AccountingLocationSelect({
  defaultValue,
  children,
  className,
  style,
}: {
  defaultValue: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <select
      name="location"
      defaultValue={defaultValue}
      className={className}
      style={style}
      onChange={event => {
        const form = event.currentTarget.form
        if (!form) return
        const vendorSelect = form.elements.namedItem('vendor')
        if (vendorSelect instanceof HTMLSelectElement) vendorSelect.value = 'all'
        form.requestSubmit()
      }}
    >
      {children}
    </select>
  )
}
