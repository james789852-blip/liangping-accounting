'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'
import { createUser } from '@/app/actions/users'

interface Store { id: string; name: string }

const ROLES = ['店長', '副店長', '助理', '顧問', '經理', '總監']

export default function UserCreateDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: '店長',
  })
  const [selectedStores, setSelectedStores] = useState<string[]>([])

  function toggleStore(id: string) {
    setSelectedStores(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) {
      toast.error('請填寫所有必填欄位')
      return
    }
    if (selectedStores.length === 0) {
      toast.error('請至少選擇一家店')
      return
    }
    setLoading(true)
    const result = await createUser({ ...form, store_ids: selectedStores })
    if (result.error) {
      toast.error('建立失敗：' + result.error)
    } else {
      toast.success('帳號建立成功！')
      setOpen(false)
      setForm({ name: '', email: '', password: '', role: '店長' })
      setSelectedStores([])
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" /> 新增帳號
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增使用者帳號</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>姓名 *</Label>
            <Input placeholder="王小明" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>電子郵件 *</Label>
            <Input type="email" placeholder="user@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>初始密碼 *（8碼以上）</Label>
            <Input type="password" placeholder="至少 8 個字元" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>職務</Label>
            <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>指派店家（可多選）</Label>
            <div className="flex flex-wrap gap-2">
              {stores.map(s => (
                <button
                  key={s.id} type="button"
                  onClick={() => toggleStore(s.id)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    selectedStores.includes(s.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            {selectedStores.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedStores.map(id => {
                  const s = stores.find(x => x.id === id)
                  return <Badge key={id} variant="secondary" className="gap-1">
                    {s?.name}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleStore(id)} />
                  </Badge>
                })}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              建立帳號
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
