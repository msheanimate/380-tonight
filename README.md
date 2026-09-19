# The 380 — a going-out guide for the Cedar Rapids–Iowa City Corridor

A static Astro site: Tonight picks split IC / CR, a Drink and Eat database with filters, Events, a Hawkeye Game Day page, ten neighborhood guides, and 100 venue pages. Light, app-style design: white cards, one spring-green accent, a bottom tab bar on phones and a top nav on desktop. Built for phones first. No backend, no database server — everything lives in JSON files in `src/data/`.

## Run it

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

Requires Node 18+ (built on Node 22, Astro 7).

## Deploy (pick one, all free tiers)

- **Netlify:** new site from Git → build command `npm run build`, publish directory `dist`.
- **Vercel:** import the repo; it detects Astro. Build `npm run build`, output `dist`.
- **Cloudflare Pages:** framework preset Astro, build `npm run build`, output `dist`.

Set `site` in `astro.config.mjs` to your real domain once you have it.

## Where the content lives

| File | What it is |
| --- | --- |
| `src/data/venues-iowa-city.json` | 53 Iowa City / Coralville / North Liberty venues |
| `src/data/venues-cedar-rapids.json` | 47 Cedar Rapids / Marion venues |
| `src/data/districts.json` | The ten neighborhood guides (scene, practical notes, events) |
| `src/data/events.json` | Dated events (`date: "2026-10-31"`) and weekly ones (`date: "weekly", weekday: "Tue"`) |
| `src/data/games.json` | 2026 Hawkeye football schedule (from hawkeyesports.com); fill in `time` as kickoffs are announced |
| `src/pages/index.astro` | Tonight's picks: edit the `picksIC` / `picksCR` slug lists each Thursday |

### Venue record

```json
{"name":"Gabe's","slug":"gabes","city":"Iowa City","district":"downtown","type":"music-venue",
 "address":"330 E Washington St, Iowa City, IA 52240",
 "tags":["live-music","late-night","dive","patio"],
 "happy_hour":null,"hours_note":"…","website":"https://icgabes.com/",
 "blurb":"one honest sentence","source":"where it came from","verify":true}
```

- `district` must match a slug in `districts.json`.
- `type`: bar · brewery · restaurant · music-venue · theater · cinema · arena · other.
- `tags` drive the filter chips: patio, live-music, trivia, karaoke, late-night, cocktails, dive, sports-bar, game-day, brunch, pizza, all-ages.
- `happy_hour`: free text as the venue publishes it. The Happy Hour Finder on `/drink/` lists every venue that has one — it's nearly empty on purpose. **Collecting happy hours is the first content job.**
- `photo` (optional): path under `public/`, e.g. `/photos/gabes.jpg`. Cards and venue pages use it; without it they show a colored placeholder with a type icon.
- `verify: true` shows a "not yet walked by us" line on the venue page. Flip it to `false` once you've confirmed the listing in person.

**Every venue in the seed data is marked `verify: true`.** They came from public listings (Think Iowa City, Cedar Rapids Tourism, Downtown CR, Uptown Marion, The District, venue sites) in September 2026, and a handful have incomplete addresses (marked in `hours_note`). Walk them before launch.

## The IC / CR toggle

The header toggle hides anything with `data-side="ic"` or `data-side="cr"` and remembers the choice per device in `localStorage`. Cards get their side from the venue's city automatically.

## Things to wire up before launch

1. **Email signup** (`src/pages/index.astro`): point the form at Beehiiv, Mailchimp or Buttondown. The Thursday email is the product; do this first.
2. **Party Pics**: add `src/data/galleries.json` and a gallery page; drop images in `public/pics/<date>-<venue-slug>/`. Keep the takedown address live.
3. **Event feeds**: `events.json` is hand-entered. Englert, Hancher, Paramount, Xtream Arena and CSPS publish calendars; a small script that pulls their iCal/RSS into `events.json` at build time is the next step. Hoopla and the Downtown District calendars need permission.
4. **Domain and analytics**: `380tonight.com` is assumed throughout (`about.astro`, `party-pics.astro`, `astro.config.mjs`); check availability. Add Plausible or Fathom, not Google, if you want the "no tracking" line to stay true.
5. **Happy hours**: see above. Once there are 40+ with times, the finder can become "happy hour right now" by parsing a structured `happy_hours: [{days, start, end}]` field — schema is yours to define.

## Structure

```
src/
  data/           JSON content (edit these)
  lib/data.ts     loads JSON, helpers (sideOf, upcomingEvents, fmtDate)
  layouts/Base.astro   header, nav, IC/CR toggle, footer
  components/     VenueCard, EventCard
  pages/          index (Tonight), drink, eat, events, game-day, party-pics, about,
                  neighborhoods/[slug], venues/[slug]
  styles/global.css    design tokens (colors, radius, shadows); change --green to re-theme
  lib/art.ts      placeholder gradients + icons for venues without a photo
public/favicon.svg
```
