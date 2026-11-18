# Homepage and themes: developer notes

The homepage hero shows the desk-photo cutout over a decorative candlestick and volume chart, in six switchable themes. It uses plain HTML, CSS and JavaScript, with no dependencies; the only network requests are web fonts and, on request, the TradingView overlay. This folder holds the acceptance checks and the scripts that rebuild the hero's assets; nothing in it is loaded by the site.

The approved prototype this was built from is on the `design/hero-chart-prototype` branch (`chart-prototype/desk.html`).

## Where things live

| File | Purpose |
|---|---|
| `index.html` | Homepage markup. The hero chart is `<div class="candle-backdrop" id="hero-candles">` inside `.hero-chart`. |
| `css/site.css` | Shared styles for every page (base, nav, sections, project pages). No homepage-only rules, and unchanged by the themes. |
| `css/themes.css` | The six themes: every colour, gradient, shadow, chart colour and decorative effect as tokens, the mapping of those tokens onto the shared components, and the theme picker's styles. Loaded by every page. |
| `css/candle-backdrop.css` | Chart component styles, all scoped to `.candle-backdrop`. |
| `css/home.css` | Homepage layout, type, portrait, the chart's placement and fades, the decor layer's positions and animations, and the project-card animations. Uses only theme tokens for colour. |
| `js/theme.js` | Theme manager, loaded in every page's `<head>`: applies the saved theme before the page paints, builds the picker, saves the choice, crossfades between themes. |
| `js/ohlcv-fixture.js` | Fixed, labeled OHLCV fixture: 240 synthetic daily candles, not market data. |
| `js/candle-backdrop.js` | The chart component (`window.CandleBackdrop`). |
| `js/home-hero.js` | Mounts the chart and exposes it as `window.heroChart`. |
| `js/hero-chart.js` | The "Live overlay" toggle: loads TradingView's BTC/USD chart over the candles on request. |
| `js/thumbnails.js` | Live-dashboard details on the homepage project cards (draw-in lines, pinging dots, breathing bars). |
| `assets/haley-desk-cutout.webp` | The desk photo as a soft cutout with transparency (1152 × 941). |
| `dev/checks/acceptance.js` | Screenshot and pixel checks (below). |
| `dev/tools/make-cutout.py` | Rebuilds the cutout from the original photo and a person matte. |
| `dev/tools/make-fixture.py` | Regenerates `js/ohlcv-fixture.js`. Values are written out literally. |
| `dev/tools/make-decor.py` | Generates the hero's decorative SVG (ribbons, mountains, hills, clouds, sparkles) into `index.html`. |

Only `index.html` loads `home.css` and the chart files. Project pages load `css/site.css`, `css/themes.css` and `js/theme.js`, so they follow the chosen theme, but work on them can't move the hero, and hero changes can't affect them.

## Adding a project page

1. Create `projects/<name>/index.html` like the existing project pages: `<script src="../../js/theme.js"></script>` in the `<head>`, then `../../css/site.css` and `../../css/themes.css`. The theme picker adds itself to the page's `.nav-inner`.
2. Link to it from the homepage: a card in the work or lab section, or a hero shortcut in `.hero-shortcuts` (each shortcut is an `<a>` with an inline SVG icon and a `<span>` label).
3. Run the acceptance checks. "Page links resolve" confirms the new link loads.

Don't add project styles to `css/home.css`, or homepage styles to `css/site.css`.

## Themes

Six themes, all defined in `css/themes.css`:

| id | Name | Look |
|---|---|---|
| `classic` | Classic | Warm espresso and mocha, champagne type, teal and terracotta candles (the original design) |
| `haleys-choice` | Haley's Choice | Pastel blue, lavender and blush, bright pink accents, silk strands (default for new visitors) |
| `mile-high` | Mile High | Crisp white, royal blue and bright orange ribbons, snow-capped mountains |
| `liquidity` | Liquidity | Sky blue, cobalt and gold, sun, clouds, glassy water ribbons |
| `flow` | Flow | Sage and mint, emerald glass ribbons, rolling hills, clouds |
| `surge` | Surge | White with electric blue, purple, fuchsia and orange ribbons |

How it works:

- **Choosing:** `js/theme.js` sets `data-theme` on `<html>` before the page paints (from `localStorage` key `hm-theme`, default `haleys-choice`), and keeps it in sync across pages and open tabs. Without JavaScript the page falls back to Haley's Choice.
- **Tokens:** each theme's block in `css/themes.css` defines `--theme-*` tokens for the homepage (nav, headline, tagline, buttons, shortcuts, scene background, chart, intro band, picker), overrides the shared palette in `css/site.css` (`--ink`, `--ivory`, `--cream` ... `--red`) and sets mapping tokens (`--console-bg`, `--tile-bg`, `--nav-bg` ...) for the lower sections and project pages. Classic leaves the mapping tokens unset, so everything falls back to the original values and Classic renders exactly as before.
- **Chart:** `--theme-chart-*` tokens feed the component's `--cb-*` properties. A colour can blend left to right with an `-end` partner (Surge does). On a theme change, `js/home-hero.js` calls `heroChart.refresh()`, which redraws in the new colours without moving the price scale.
- **Decor:** the hero's backgrounds are inline SVG in `index.html` (between `<!-- decor:start -->` and `<!-- decor:end -->`), generated by `dev/tools/make-decor.py`. Each piece belongs to a slot (`decor-top`, `decor-side`, `decor-bottom`, `decor-land--mountains`, `decor-land--hills`, clouds, sun, sparkles) and to a theme group (`.dz-<theme>`). Which slots each theme shows is set under "Hero decor per theme" in `css/themes.css`; their colours are `--decor-*` tokens in each theme's block. To change the art, edit the generator and run `python3 dev/tools/make-decor.py`; don't edit the block by hand.
- **Motion:** decor slots sway, clouds drift, the sun glows and sparkles twinkle, all with CSS transform and opacity only. The newest candle ticks gently every few seconds. The project cards animate when they come into view. Visitors who prefer reduced motion get none of it.
- **Switching:** the picker crossfades the page with the View Transitions API where the browser supports it, and switches instantly elsewhere.

To adjust a theme, change its block in `css/themes.css` (and, for the art, the generator). To add a seventh theme: add a block scoped to `[data-theme="<id>"]` with every token the other themes define, add its decor rules, and add `{ id, name, meta }` to the `THEMES` list in `js/theme.js`.

### Contrast

`dev/checks/acceptance.js` measures each theme's hero text against the pixels actually behind it. A few places follow the references rather than WCAG AA and are reported as known exceptions:

| Theme | Text | Contrast | Why |
|---|---|---|---|
| Haley's Choice | Nav links | about 1.8:1 | White on pastel blue, as in the reference |
| Haley's Choice | Primary button | about 3.0:1 | White on bright pink, as in the reference |
| Mile High | Primary button | about 2.5:1 | White on bright orange, as in the reference |
| Surge | Primary button | about 2.7:1 | White on the orange-to-fuchsia gradient, as in the reference |
| Classic | Chart caption on phones | about 3.8:1 | Unchanged from the approved design |

Reaching 4.5:1 with white text would need much deeper fills (hot magenta, burnt orange). The alternative that keeps the fills is dark text on the bright buttons and the Haley's Choice nav: change `--theme-button-primary-text` and `--theme-nav-text` in those themes' blocks.

## Chart component API

```js
const chart = CandleBackdrop.mount(container, candles, options);
```

- `container`: an element with a size. The chart fills it and redraws only when the container is resized. The component adds `class="candle-backdrop"`, `aria-hidden="true"` and `inert`, so the chart never takes clicks or keyboard focus.
- `candles`: an array of `{ t, o, h, l, c, v }`, oldest first. `t` is an ISO date.
- `options` (optional):
  - `headroom` (default `0.14`) and `footroom` (default `0.06`) set the space above and below the visible price range.
  - `volumeHeadroom` (default `0.3`) sets the extra space above the tallest visible volume bar.

| Method | What it does |
|---|---|
| `updateLatest(candle)` | Revises the newest candle in place and returns `true`. Accepts a full or partial candle (`{ c, v }` is fine). `h` and `l` widen to cover `o` and `c`. If `t` is given and doesn't match the newest candle, nothing changes and it returns `false`. Only the newest candle and its volume bar are redrawn, and the price and volume scales stay locked. Values beyond the locked range are clipped at the pane edge. |
| `setData(candles)` | Replaces the series and refits the scales. Use it when a new daily candle opens. |
| `getLatest()` | Returns a copy of the newest candle. |
| `getLatestColumn()` | Returns the newest candle's column in CSS px relative to the container. |
| `getScale()` | Returns the locked `{ min, max, volumeMax }`. |
| `destroy()` | Removes the canvases and listeners. |

The chart is drawn on two canvases:

- **History and grid:** drawn once, on the base canvas.
- **Newest candle:** has a canvas of its own, so an update can't disturb anything else.

Each canvas pixel maps to exactly one device pixel. The fade mask sits on an inner stage element rather than on the container, which keeps every edge crisp even when the container lands on a fractional position.

Appearance is set with CSS custom properties on the container: colours, grid, `--cb-spacing`, `--cb-body`, `--cb-right-pad`, pane sizes and `--cb-mask`. The full list is in the header of `css/candle-backdrop.css`, and the homepage values are in `css/home.css`.

### Connecting a live feed (optional)

The chart is `window.heroChart`. Any provider works as long as you map its fields to `{ o, h, l, c, v }`:

```js
function onTick(bar) {                       // bar from your provider
  const day = bar.time.slice(0, 10);
  if (day === heroChart.getLatest().t) {
    heroChart.updateLatest({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume });
  } else {
    candles.push({ t: day, o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume });
    heroChart.setData(candles);              // new day: one full redraw
  }
}
```

If you connect real data, change the caption "Chart: illustrative data" in `index.html` to name the source.

## Live overlay

The "Live overlay" button in the caption row loads TradingView's BTC/USD daily chart into the same band as the candles (`#hero-chart-live`, inside the inert chart layer).

- **What it looks like:** its light chart is inverted and screened into the scene, as on the earlier homepage, and the illustrative candles dim to 42% beneath it. Unlike the earlier version it doesn't drift side to side, so the hero stays still.
- **Caption:** while it's on, the caption reads "Chart: live BTC/USD".
- **Loading:** nothing is fetched from TradingView until the button is pressed.
- **Failure:** if the widget doesn't load within 8 seconds, or its script fails, it falls back to the illustrative candles and says "TradingView is unavailable. Showing sample candles."
- **Attribution link:** TradingView's script injects `!important` styles for its link (13px type, its own colours). `home.css` pins the link to its theme look, so the row doesn't change size when the overlay loads.

## Acceptance checks

From the repository root, with a static server running:

```bash
python3 -m http.server 8765
```

```bash
node dev/checks/acceptance.js
```

It needs Playwright with Chromium. To check another URL or output folder: `node dev/checks/acceptance.js <url> <outDir>`. Screenshots and `results.json` go to `dev/checks/output/`, which git ignores. The hero is captured in viewport-sized tiles by scrolling, because a full-page capture briefly resizes the page, which would refit the chart.

It runs every check below for each theme (`--themes=classic,flow` to pick some), at 1440 × 900 and 390 × 844, at 2× pixel density, with reduced motion so the hero holds still for pixel comparisons:

- **Loading:**
  - The chart mounts, every request succeeds and every image decodes.
  - The portrait and chart never shift while the page loads.
  - The total layout shift stays under 0.01. Web fonts swapping in nudge the nav text and the caption row by about 0.004 to 0.007; that was already true on `main`.
- **Stillness:** the hero is pixel-identical at rest and 10 seconds later, and the chart box hasn't moved.
- **Overflow:** there is no horizontal page overflow.
- **Clarity:** how much the chart changes the headline, tagline, description, buttons, shortcuts and face, measured by comparing the chart shown and hidden.
  - The limit is a mean change of 3/255 over text and 0.5/255 over the face.
  - The face box comes from the portrait's `data-face` attribute.
- **Chart beside the silhouette:** the `data-beside` boxes, beside each shoulder, must show the chart, with a mean change of at least 2/255.
- **Crispness:**
  - Every grid line is exactly 1 CSS px on the canvas.
  - On screen, each line covers exactly its own device pixels, with no bleed into its neighbours. A blurred chart fails this: a 0.3px offset produced thousands of bleed samples.
  - Areas under the hero text are skipped, because text layered above the chart can render one colour level differently when the chart is hidden.
- **Clicks and keyboard:**
  - Both hero buttons receive clicks.
  - The chart is inert, hidden from assistive tech and has `pointer-events: none`.
  - Focus never enters the chart over 25 Tab presses.
- **Links:**
  - In-page anchors exist.
  - Same-site links load, including any `#id` they point to.
  - External links are counted but not fetched.
- **Updates:**
  - Three test updates to the newest candle each change only its column, in both the price and volume panes.
  - The price scale holds and the history layer stays byte-identical.
- **Clipping:** an update far outside the locked range stays clipped inside that column.
- **Theme:** the theme applied, the chart drew in its candle colours, and the hero text meets WCAG AA against what is behind it (known exceptions above are reported as WARN).
- **Live overlay** (first theme only, as are the link checks):
  - Nothing loads from TradingView until the toggle is pressed.
  - The toggle can be clicked and focused, and works from the keyboard.
  - Online, the live chart appears with the candles dimmed, the history layer untouched and the controls row the same size. Pressing again restores the candles and caption.
  - Offline, it falls back with its message, so the check passes either way.

Then, once, the theme system:

- New visitors get Haley's Choice.
- The picker lists the six themes with palette previews, and works by keyboard (Enter, arrows, Escape) and pointer, closing on an outside click.
- The choice survives a reload, reaches a project page, and syncs to another open tab.
- With motion allowed, the decor animates using only transform and opacity, the newest candle ticks while the history layer stays byte-identical, and there are no long main-thread tasks.
- With reduced motion, nothing animates and the newest candle holds still.

`data-face` and `data-beside` on the portrait are fractions of the photo (`x y w h`). If the photo changes, update them.

## Desk photo cutout

The photo is scaled so the eyes are 84px apart on a 1440px-wide screen, against 126px for the earlier headshot. That makes the face about a third smaller. It is anchored to the bottom right, so the desk and laptop sit along the bottom of the hero, and the hero is about 50px taller on desktop than before (`min-height: clamp(660px, 54vw, 860px)`). The chart band ends just above the laptop, so the newest candles and volume bars sit beside the left shoulder.

How `dev/tools/make-cutout.py` builds it:

1. **Person matte:** from the BiRefNet "general" matting model, run locally with ONNX Runtime. It kept more hair detail than the portrait model.
2. **Chair:** the model treats the wicker chair as background, so it is removed.
3. **Laptop:** traced as a polygon, because the model drops it.
4. **Desk:** kept below the wall line, fading out toward the copy.
5. **Edges:** the beige wall is removed from semi-transparent hair and jacket edges, and the matte is feathered slightly. Fully opaque pixels, including the face, keep their original colours.

The original photo and the model aren't in the repository, so the script takes them as arguments:

```bash
python3 dev/tools/make-cutout.py <photo.jpg> <person-matte.png> assets/haley-desk-cutout.webp
```

**Limitation:** the source photo is 1672px wide. On 2× (retina) screens it is enlarged about 1.8×, so it looks slightly softer than a full-resolution photo would. A higher-resolution original would fix that with no other changes.

## Colour notes

The chart uses muted teal `#58a593` (up) and terracotta `#c9744f` (down).

- **Validation:** they pass the palette validator for colour-blind separation (ΔE 9.1) and normal-vision separation (ΔE 18.6).
- **Known gaps:** they sit below its chroma floor because the brief asked for muted colours, and terracotta is under 3:1 contrast on the lighter brown.
- **Why that's acceptable:** the chart is decorative, hidden from assistive tech and labeled illustrative.
