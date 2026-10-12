import { memo, useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { thumb, useVideoMeta, watchUrl } from '../lib/meta'
import { fmtDateTime, relTime } from '../lib/stats'
import type { Echo } from '../lib/types'

const seen = new Set<string>()

export function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}

function Thumb({ id }: { id?: string }) {
  const [ok, setOk] = useState(false)
  const [bad, setBad] = useState(false)
  if (!id || bad)
    return (
      <div className="thumb thumb-empty">
        <Icon name={id ? 'video' : 'chat'} size={20} />
      </div>
    )
  return (
    <div className={`thumb ${ok ? '' : 'skeleton'}`}>
      <img src={thumb(id)} alt="" loading="lazy" decoding="async" className={ok ? 'loaded' : ''} onLoad={() => setOk(true)} onError={() => setBad(true)} />
    </div>
  )
}

const KIND: Record<string, [string, string]> = {
  reply: ['reply', 'Reply'],
  chat: ['chat', 'Live chat'],
  post: ['chat', 'Community post'],
}

export const CommentCard = memo(function CommentCard({
  e,
  terms,
  onVideo,
  onCopy,
  flash,
}: {
  e: Echo
  terms: string[]
  onVideo?: (id: string) => void
  onCopy: (text: string) => void
  flash?: boolean
}) {
  const meta = useVideoMeta(e.videoId)
  const [open, setOpen] = useState(false)
  // animate in only the first time a card is ever shown (virtualized rows remount on scroll)
  const [fresh] = useState(() => !seen.has(e.id))
  useEffect(() => {
    seen.add(e.id)
  }, [e.id])
  const long = e.text.length > 420 || e.text.split('\n').length > 6
  const href = e.videoId ? watchUrl(e.videoId, e.id) : e.postId ? `https://www.youtube.com/post/${e.postId}` : undefined
  return (
    <article className={`ccard ${fresh ? 'enter' : ''} ${flash ? 'flash' : ''}`}>
      <a className="ccard-media" href={href} target="_blank" rel="noreferrer" tabIndex={-1}>
        <Thumb id={e.videoId} />
      </a>
      <div className="ccard-body">
        <div className="ccard-video">
          {e.videoId ? (
            meta?.title ? (
              <button className="ccard-title" onClick={() => onVideo?.(e.videoId!)} title="Show all comments on this video">
                {highlight(meta.title, terms)}
              </button>
            ) : meta?.missing ? (
              <span className="ccard-title muted">Unavailable video</span>
            ) : (
              <span className="skeleton line" />
            )
          ) : (
            <span className="ccard-title muted">{e.kind === 'post' ? 'Community post' : 'Comment'}</span>
          )}
          {meta?.author && <span className="ccard-author">{meta.author}</span>}
        </div>
        <p className={`ccard-text ${long && !open ? 'clamp' : ''}`}>{highlight(e.text, terms)}</p>
        {long && (
          <button className="more" onClick={() => setOpen((o) => !o)}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
        <div className="ccard-foot">
          <span className="when" title={fmtDateTime(e.at)}>
            {relTime(e.at)}
          </span>
          <span className="dot">·</span>
          <span className="date">{fmtDateTime(e.at)}</span>
          {KIND[e.kind] && (
            <span className="kind">
              <Icon name={KIND[e.kind][0]} size={12} /> {KIND[e.kind][1]}
            </span>
          )}
          <div className="ccard-actions">
            <button className="icon-btn sm" title="Copy text" onClick={() => onCopy(e.text)}>
              <Icon name="copy" size={15} />
            </button>
            {href && (
              <a className="open-btn" href={href} target="_blank" rel="noreferrer" title="Open on YouTube, scrolled to your comment">
                Open <Icon name="external" size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  )
})
