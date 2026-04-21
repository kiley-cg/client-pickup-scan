import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import AdminHome from './AdminHome'

export default async function Home() {
  if (!(await isAdmin())) redirect('/login?next=/')
  return <AdminHome />
}
