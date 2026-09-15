import Link from 'next/link'
import type { ComponentProps } from 'react'

type ReliableNavigationLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'> & {
  /**
   * Use a fresh document for routes that are especially sensitive to stale
   * App Router state (for example the large, authenticated closing wizard).
   */
  forceDocument?: boolean
}

export default function ReliableNavigationLink({
  forceDocument = false,
  href,
  ...props
}: ReliableNavigationLinkProps) {
  if (forceDocument && typeof href === 'string') {
    return <a href={href} data-full-page-navigation="true" {...props} />
  }

  // Protected pages must not all refresh the same Supabase session in the
  // background. They load on demand when the user actually selects one.
  return <Link href={href} prefetch={false} {...props} />
}
