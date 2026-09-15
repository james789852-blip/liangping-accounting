import Link from 'next/link'
import type { ComponentProps } from 'react'

type ReliableNavigationLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'>

export default function ReliableNavigationLink({
  href,
  ...props
}: ReliableNavigationLinkProps) {
  // Protected pages must not all refresh the same Supabase session in the
  // background. They load on demand when the user actually selects one.
  return <Link href={href} prefetch={false} {...props} />
}
