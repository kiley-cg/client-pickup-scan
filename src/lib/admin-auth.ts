import { cookies } from 'next/headers'
import { env } from '@/lib/env'

export const ADMIN_COOKIE = 'cg_admin'

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(ADMIN_COOKIE)?.value === env().ADMIN_PASSWORD
}

export function isAdminFromRequest(req: Request): boolean {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`))
  if (!match) return false
  return decodeURIComponent(match[1]) === env().ADMIN_PASSWORD
}
