import { useState } from 'react'
import { t } from '../i18n'
import { Icon } from './Icon'

/** Page number links (3 pages around plus first and last) and a field to jump to a number */
export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage(p: number): void }) {
  const [input, setInput] = useState('')
  const nums = new Set<number>([1, pages])
  for (let i = page - 3; i <= page + 3; i++) if (i >= 1 && i <= pages) nums.add(i)
  const sorted = [...nums].sort((a, b) => a - b)
  return (
    <div className="pagination">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="back" size={16} />
      </button>
      {sorted.map((n, i) => (
        <span key={n} className="pg">
          {i > 0 && n - sorted[i - 1] > 1 && <span className="gap">…</span>}
          <button className={n === page ? 'active' : ''} onClick={() => onPage(n)}>
            {n}
          </button>
        </span>
      ))}
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>
        <Icon name="forward" size={16} />
      </button>
      <input
        className="jump"
        placeholder={t('pagination.jump')}
        value={input}
        onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input) {
            onPage(Math.min(pages, Math.max(1, Number(input))))
            setInput('')
          }
        }}
      />
    </div>
  )
}
