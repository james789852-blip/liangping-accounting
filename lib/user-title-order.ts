type UserWithTitle = {
  title?: string | null
  role?: string | null
}

const TITLE_PRIORITY: Record<string, number> = {
  老闆: 0,
  總監: 10,
  廠長: 10,
  店長: 10,
  經理: 20,
  副廠長: 20,
  副店長: 20,
  顧問: 30,
  小幫手: 30,
  助理: 40,
}

export function sortUsersByTitle<T extends UserWithTitle>(users: readonly T[]): T[] {
  return users
    .map((user, index) => ({
      user,
      index,
      priority: TITLE_PRIORITY[(user.title ?? user.role ?? '').trim()] ?? 999,
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ user }) => user)
}
