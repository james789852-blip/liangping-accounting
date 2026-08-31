export default function NavigationSkeleton({ variant }: { variant: 'manager' | 'hq' }) {
  const sidebarWidth = variant === 'hq' ? 'lg:w-64' : 'lg:w-60'

  return (
    <>
      <aside
        aria-hidden="true"
        className={`hidden ${sidebarWidth} shrink-0 animate-pulse flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex`}
      >
        <div className="h-9 w-36 rounded-xl bg-slate-100" />
        <div className="mt-8 h-16 rounded-2xl bg-slate-100" />
        <div className="mt-8 space-y-3">
          {[88, 72, 92, 64, 80, 76].map((width, index) => (
            <div key={index} className="flex h-11 items-center gap-3 rounded-xl px-3">
              <div className="h-5 w-5 rounded-md bg-slate-100" />
              <div className="h-4 rounded bg-slate-100" style={{ width: `${width}px` }} />
            </div>
          ))}
        </div>
      </aside>

      <header
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-30 flex h-14 animate-pulse items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden"
      >
        <div className="h-7 w-28 rounded-lg bg-slate-100" />
        <div className="h-8 w-8 rounded-full bg-slate-100" />
      </header>
      <nav
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 animate-pulse items-center justify-around border-t border-slate-200 bg-white px-4 lg:hidden"
      >
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-8 w-10 rounded-lg bg-slate-100" />
        ))}
      </nav>
    </>
  )
}
