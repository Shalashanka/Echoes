import type { Echo, VideoMeta } from './types'

// A believable sample history so the app can be explored without a Takeout export.
const VIDEOS: [string, string, string][] = [
  ['dQw4w9WgXcQ', 'Rick Astley - Never Gonna Give You Up (Official Video)', 'Rick Astley'],
  ['jNQXAC9IVRw', 'Me at the zoo', 'jawed'],
  ['9bZkp7q19f0', 'PSY - GANGNAM STYLE (강남스타일) M/V', 'officialpsy'],
  ['kJQP7kiw5Fk', 'Luis Fonsi - Despacito ft. Daddy Yankee', 'Luis Fonsi'],
  ['OPf0YbXqDm0', 'Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars', 'Mark Ronson'],
  ['JGwWNGJdvx8', 'Ed Sheeran - Shape of You (Official Music Video)', 'Ed Sheeran'],
  ['YQHsXMglC9A', 'Adele - Hello (Official Music Video)', 'Adele'],
  ['fJ9rUzIMcZQ', 'Queen – Bohemian Rhapsody (Official Video Remastered)', 'Queen Official'],
  ['hT_nvWreIhg', 'OneRepublic - Counting Stars (Official Music Video)', 'OneRepublic'],
  ['RgKAFK5djSk', 'Wiz Khalifa - See You Again ft. Charlie Puth', 'Wiz Khalifa'],
  ['60ItHLz5WEA', 'Alan Walker - Faded', 'Alan Walker'],
  ['pRpeEdMmmQ0', 'Shakira - Waka Waka (This Time for Africa)', 'shakiraVEVO'],
  ['e-ORhEE9VVg', 'Taylor Swift - Blank Space', 'Taylor Swift'],
  ['lp-EO5I60KA', 'Ed Sheeran - Thinking Out Loud (Official Music Video)', 'Ed Sheeran'],
  ['CevxZvSJLk8', 'Katy Perry - Roar (Official)', 'Katy Perry'],
  ['2Vv-BfVoq4g', 'Ed Sheeran - Perfect (Official Music Video)', 'Ed Sheeran'],
]

const LINES = [
  'This song never gets old. Still listening in {y}.',
  'Who else is here after {thing}? 😂',
  'The bridge at {t} gives me chills every single time.',
  'Came for the nostalgia, stayed for the comments.',
  'My teacher played this in class and now I can’t stop.',
  'Underrated comment section honestly.',
  '{t} – the moment everything changes.',
  'I remember watching this on my old laptop. Simpler times.',
  'Not me rewinding {t} ten times 🙃',
  'Production quality on this is insane for its time.',
  'This deserves way more views than it has.',
  'Listening to this while studying for finals. Wish me luck!',
  'The way the drums kick in at {t}…',
  'Honestly a masterpiece. No skips.',
  'Anyone else get recommended this at 3am?',
  'Thank you for the subtitles, really appreciated 🙏',
  'Called it. Told my friends this would blow up.',
  'Replying here so I remember to come back to this.',
  'Great point, I never thought about it that way.',
  'Agreed, the original is still the best version.',
  'Fun fact: this was recorded in a single take.',
  'Just showed this to my parents and they loved it ❤️',
]
const THINGS = ['the meme', 'that TikTok', 'the movie trailer', 'the halftime show', 'the remix']

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function demoData(): { echoes: Echo[]; meta: Record<string, VideoMeta> } {
  const r = rng(42)
  const now = Date.now()
  const start = now - 8.5 * 365 * 24 * 3600 * 1000
  const echoes: Echo[] = []
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  for (let i = 0; i < 1400; i++) {
    // bursty activity: some periods are much busier than others
    const u = r()
    const at = Math.floor(start + (now - start) * (0.15 + 0.85 * Math.pow(u, 0.7)) - r() * 9e8)
    const v = VIDEOS[Math.floor(Math.pow(r(), 1.6) * VIDEOS.length)]
    const y = new Date(at).getFullYear()
    const t = `${Math.floor(r() * 4)}:${String(Math.floor(r() * 60)).padStart(2, '0')}`
    const text = pick(LINES).replace('{y}', String(y)).replace('{t}', t).replace('{thing}', pick(THINGS))
    const reply = r() < 0.22
    echoes.push({
      id: `Ugz${Math.floor(r() * 1e12).toString(36)}${i.toString(36)}${reply ? `.9${i.toString(36)}` : ''}`,
      text,
      at,
      kind: reply ? 'reply' : 'comment',
      videoId: v[0],
      parentId: reply ? 'Ugx' + i.toString(36) : undefined,
    })
  }
  echoes.sort((a, b) => b.at - a.at)
  const meta: Record<string, VideoMeta> = {}
  for (const [id, title, author] of VIDEOS) meta[id] = { title, author, t: now }
  return { echoes, meta }
}
