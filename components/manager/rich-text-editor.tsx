'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Undo, Redo, Quote } from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

export default function RichTextEditor({ value, onChange, placeholder = '', minHeight = 120 }: Props) {
  const lastEmitted = useRef(value)

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    immediatelyRender: false,
    onUpdate({ editor }) {
      const html = editor.getHTML()
      lastEmitted.current = html
      onChange(html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
        style: `min-height:${minHeight}px;padding:12px 14px;font-family:inherit;color:#18181b;line-height:1.65;`,
      },
    },
  })

  // 同步外部 value（例如系統自動帶入內容）
  useEffect(() => {
    if (!editor) return
    if (value === lastEmitted.current) return
    editor.commands.setContent(value || '', { emitUpdate: false })
    lastEmitted.current = value
  }, [value, editor])

  if (!editor) return (
    <div style={{ minHeight, border: '1.5px solid #e4e4e7', borderRadius: 12, padding: '12px 14px', color: '#a1a1aa', fontSize: 14 }}>
      載入編輯器中…
    </div>
  )

  const TB = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} title={title}
      style={{
        height: 32, minWidth: 32, padding: '0 6px',
        background: active ? '#FEF3C7' : 'white',
        color: active ? '#B45309' : '#52525b',
        border: '1px solid ' + (active ? '#F59E0B' : '#e4e4e7'),
        borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {children}
    </button>
  )

  return (
    <div style={{ border: '1.5px solid #e4e4e7', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
      <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid #f4f4f5', background: '#fafafa', flexWrap: 'wrap' }}>
        <TB active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="粗體 (Cmd+B)"><Bold className="h-3.5 w-3.5" /></TB>
        <TB active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜體 (Cmd+I)"><Italic className="h-3.5 w-3.5" /></TB>
        <span style={{ width: 1, background: '#e4e4e7', margin: '0 4px' }} />
        <TB active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="大標題"><Heading2 className="h-3.5 w-3.5" /></TB>
        <TB active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="小標題"><Heading3 className="h-3.5 w-3.5" /></TB>
        <span style={{ width: 1, background: '#e4e4e7', margin: '0 4px' }} />
        <TB active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="項目符號"><List className="h-3.5 w-3.5" /></TB>
        <TB active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="編號"><ListOrdered className="h-3.5 w-3.5" /></TB>
        <TB active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用"><Quote className="h-3.5 w-3.5" /></TB>
        <span style={{ width: 1, background: '#e4e4e7', margin: '0 4px' }} />
        <TB onClick={() => editor.chain().focus().undo().run()} title="復原 (Cmd+Z)"><Undo className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => editor.chain().focus().redo().run()} title="重做"><Redo className="h-3.5 w-3.5" /></TB>
      </div>
      <EditorContent editor={editor} />
      {!editor.getText() && placeholder && (
        <div style={{ position: 'relative', top: -minHeight - 8, marginLeft: 14, color: '#a1a1aa', fontSize: 14, height: 0, pointerEvents: 'none' }}>
          {placeholder}
        </div>
      )}
    </div>
  )
}
