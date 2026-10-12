export type Kind = 'comment' | 'reply' | 'chat' | 'post'

export interface Echo {
  id: string
  text: string
  /** epoch ms */
  at: number
  kind: Kind
  videoId?: string
  postId?: string
  channelId?: string
  parentId?: string
}

export interface VideoMeta {
  title: string
  author: string
  /** epoch ms when fetched; failed lookups are cached too so we don't hammer */
  t: number
  missing?: boolean
}

export interface Dataset {
  echoes: Echo[]
  source: string
  importedAt: number
  demo?: boolean
}
