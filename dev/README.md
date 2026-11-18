# Homepage hero: developer notes

The homepage hero shows the desk-photo cutout over a decorative candlestick and volume chart. It uses plain HTML, CSS and JavaScript, with no dependencies and no network requests. This folder holds the acceptance checks and the scripts that rebuild the hero's assets; nothing in it is loaded by the site.

The approved prototype this was built from is on the `design/hero-chart-prototype` branch (`chart-prototype/desk.html`).

## Where things live

| File | Purpose |
|---|---|
| `index.html` | Homepage markup. The hero chart is `<div class="candle-backdrop" id="hero-candles">` inside `.hero-chart`. |
| `css/site.css` | Shared styles for every page (base, nav, sections, project pages). No homepage-only rules. |
| `css/themes/classic-espresso.css` | The active theme: every homepage hero colour as a `--theme-*` token. |
| `css/candle-backdrop.css` | Chart component styles, all scoped to `.candle-backdrop`. |
| `css/home.css` | Homepage layout, type, portrait, and the chart's placement and fades. Uses only theme tokens for colour. |
| `js/ohlcv-fixture.js` | Fixed, labeled OHLCV fixture: 240 synthetic daily candles, not market data. |
| `js/candle-backdrop.js` | The chart component (`window.CandleBackdrop`). |
| `js/home-hero.js` | Mounts the chart and exposes it as `window.heroChart`. |
| `assets/haley-desk-cutout.webp` | The desk photo as a soft cutout with transparency (1152 × 941). |
| `dev/checks/acceptance.js` | Screenshot and pixel checks (below). |
| `dev/tools/make-cutout.py` | Rebuilds the cutout from the original photo and a person matte. |
| `dev/tools/make-fixture.py` | Regenerates `js/ohlcv-fixture.js`. Values are written out literally. |

Only `index.html` loads `home.css`, the theme and the chart files. Project pages load `css/site.css` alone, so work on them can't move the hero, and hero changes can't affect them.

## Adding a project page

1. Create `projects/<name>/index.html` and link `../../css/site.css`, like the existing project pages.
2. Link to it from the homepage: a card in the work or lab section, or a hero shortcut in `.hero-shortcuts` (each shortcut is an `<a>` with an inline SVG icon and a `<span>` label).
3. Run the acceptance checks. "Page links resolve" confirms the new link loads.

Don't add project styles to `css/home.css`, or homepage styles to `css/site.css`.

## Themes

Classic Espresso is the only theme. Its tokens are on `:root` in `css/themes/classic-espresso.css`, and `css/home.css` takes every hero, navigation and intro colour from them, chart colours included (`--theme-chart-*` feed the component's `--cb-*` properties).

To add a theme later:

1. Copy the file to `css/themes/<name>.css`.
2. Scope its block to `:root[data-theme="<name>"]`.
3. Load it after `classic-espresso.css`.
4. Set `data-theme` on `<html>`.

Layout stays in `home.css`. Two things aren't tokenized yet:

- `<meta name="theme-color">` in `index.html`.
- The sections below the intro, which use the shared palette in `css/site.css` (`--charcoal`, `--cream` and others) because project pages share those rules. A theme can override those variables on `.home` when it needs to.

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

## Acceptance checks

From the repository root, with a static server running:

```bash
python3 -m http.server 8765
```

```bash
node dev/checks/acceptance.js
```

It needs Playwright with Chromium. To check another URL or output folder: `node dev/checks/acceptance.js <url> <outDir>`. Screenshots and `results.json` go to `dev/checks/output/`, which git ignores. The hero is captured in viewport-sized tiles by scrolling, because a full-page capture briefly resizes the page, which would refit the chart.

At 1440 × 900 and 390 × 844, at 2× pixel density, it checks:

- **Loading:**
  - The chart mounts, every request succeeds and every image decodes.
  - The portrait, chart and caption never shift while the page loads.
  - The total layout shift stays under 0.01. Web fonts swapping in nudge the nav text by about 0.004 to 0.007; that was already true on `main`.
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
