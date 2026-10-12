# Echoes

Every comment you've ever left on YouTube - searchable, private, and nice to look at.

Echoes reads your **Google Takeout** export directly in the browser. Nothing is uploaded: there's no
server, no account and no tracking. Your history is kept in IndexedDB on your own device, so it
opens instantly next time.

## Why Takeout?

The YouTube Data API can't list the comments *you* wrote on other people's videos. `commentThreads`
only returns comments posted *on your channel*. Google Takeout is the one official source that has
your complete comment history, including replies and live chat.

## Getting your data

1. Open [takeout.google.com](https://takeout.google.com/settings/takeout/custom/youtube). YouTube is
   pre-selected.
2. Under "All YouTube data included", keep only **comments** (and **live chats** if you want).
3. Export, download the `.zip`, and drop it on Echoes. You can also drop `comments.csv`, or
   `my-comments.html` from older exports.

No export yet? Click **Explore a demo**.

## Features

- **Instant search** across comment text and video titles, with highlighted matches.
- **Insights:** total comments, videos and words, your longest streak, a year-by-year activity
  heatmap, a monthly timeline and your most active hours. Click a day or a month to filter.
- **Three views:** all comments (virtualized, so it handles tens of thousands), grouped by video,
  and *On this day* for comments from today's date in past years.
- **Rediscover** (`R`) shows a random comment in a spotlight card.
- **Deep links:** "Open" jumps straight to your comment on YouTube (`&lc=`).
- **Export** filtered results as CSV or JSON.
- **Themes:** dark and light (`T`). Fully keyboard-driven: `/` to search, `Esc` to clear,
  `1`/`2`/`3` to switch views.

Video titles come from YouTube's public oEmbed endpoint (no API key needed) and are cached locally.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ - host it anywhere (GitHub Pages, Netlify, …)
```

Built with React, TypeScript, Vite, Motion, TanStack Virtual and fflate.
