# Hero candlestick background (prototype)

A decorative candlestick and volume chart for the homepage hero, built to sit behind the portrait. It uses plain HTML, CSS and JavaScript, with no dependencies and no network requests. Nothing outside this folder has been changed. The homepage (`index.html`), `css/site.css` and the existing scripts are only referenced.

## Preview

From the repository root:

```bash
python3 -m http.server 8765
```

Open http://localhost:8765/chart-prototype/. The review panel under the hero shows the newest candle's values and has two buttons:

- **Apply test update** revises the newest candle. Each click applies the next of three fixed updates: up, down, then up.
- **Reset to fixture** restores the newest candle to its fixture values.

## Files

| File | Purpose |
|---|---|
| `candle-backdrop.js` | The component (`window.CandleBackdrop`) |
| `candle-backdrop.css` | Component styles, all scoped to `.candle-backdrop` |
| `ohlcv-fixture.js` | Fixed, labeled OHLCV fixture: 240 synthetic daily candles, not market data |
| `hero-placement.css` | Homepage-specific placement, fades and sizing (moves into `site.css` on integration) |
| `index.html`, `preview.css` | Standalone preview and its review panel (prototype only) |
| `tools/make-fixture.py` | Regenerates the fixture. Values are written out literally. |
| `checks/acceptance.js` | Screenshot and pixel checks (see below) |

## Component API

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

The chart is drawn on two canvases. History and grid are drawn once on the base layer, and the newest candle has its own layer, so an update cannot disturb anything else. The canvases are aligned to device pixels, which keeps edges crisp at fractional layout positions.

Appearance is set with CSS custom properties on the container: colors, grid, `--cb-spacing`, `--cb-body`, `--cb-right-pad`, pane sizes and `--cb-mask`. The full list is in the header of `candle-backdrop.css`.

### Connecting a live feed (optional)

Any provider works as long as you map its fields to `{ o, h, l, c, v }`. For example:

```js
function onTick(bar) {                       // bar from your provider
  const day = bar.time.slice(0, 10);
  if (day === chart.getLatest().t) {
    chart.updateLatest({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume });
  } else {
    candles.push({ t: day, o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume });
    chart.setData(candles);                  // new day: one full redraw
  }
}
```

## Integration note (not applied; waiting for approval)

1. **Copy files:** move `candle-backdrop.js` and `ohlcv-fixture.js` to `js/`, and `candle-backdrop.css` to `css/`. Append the rules from `hero-placement.css` to `css/site.css`.
2. **Head of `index.html`,** after `css/site.css`:

   ```html
   <link rel="stylesheet" href="css/candle-backdrop.css" />
   ```

3. **Hero markup:** replace the contents of `.hero-chart` (the `.hero-chart-sample` image and the TradingView container):

   ```html
   <div class="hero-chart" aria-hidden="true" inert>
     <div class="candle-backdrop" id="hero-candles"></div>
   </div>
   ```

   Then replace the contents of `.hero-chart-controls` (toggle button, TradingView link, status) with:

   ```html
   <p class="hero-chart-note">Chart: illustrative data</p>
   ```

4. **Scripts:** replace `<script src="js/hero-chart.js"></script>` with:

   ```html
   <script src="js/ohlcv-fixture.js"></script>
   <script src="js/candle-backdrop.js"></script>
   <script>
     CandleBackdrop.mount(document.getElementById("hero-candles"), window.OHLCV_FIXTURE.candles);
   </script>
   ```

5. **Clean up:** delete `js/hero-chart.js` and `assets/hero-candles.svg`, plus the `.hero-chart-sample`, `.hero-chart-live`, `.hero-chart-toggle`, `.hero-chart-status`, TradingView and `hero-chart-drift` rules in `site.css`.

`hero-placement.css` matches its portrait fade to the current `.hero-portrait` size and mask. If the portrait changes, adjust the `radial-gradient(33% 61% at 66% 49%, …)` layer (and its mobile counterpart) to match.

## Acceptance checks

With the server running:

```bash
node chart-prototype/checks/acceptance.js
```

The script writes screenshots and `results.json` to `chart-prototype/checks/output/`, which git ignores. At 1440 × 900 and 390 × 844 (2× pixel density) it checks:

- **Stillness:** the hero is pixel-identical at rest and 10 seconds later, and the chart box hasn't moved.
- **Overflow:** there is no horizontal page overflow.
- **Clarity:** how much the chart changes the headline, tagline, description, buttons, shortcuts and face, comparing the chart shown and hidden. The limit is a mean change of 3/255 over text and 0.5/255 over the face.
- **Clicks:** both hero buttons receive clicks.
- **Keyboard:** the chart is inert, hidden from assistive tech, has `pointer-events: none`, and focus never enters it over 25 Tab presses.
- **Updates:** each demo test update changes only the newest candle's column, in both the price and volume panes. The price scale holds and the history layer stays byte-identical.
- **Clipping:** an update far outside the locked range stays clipped inside that column.

Last run: 32/32 passed.

## Design notes

- **Color:** muted teal `#58a593` (up) and terracotta `#c9744f` (down). The skill's palette validator passes them for color-blind separation (ΔE 9.1) and normal-vision separation (ΔE 18.6). They sit below its chroma floor by request ("muted"), and terracotta is under 3:1 contrast on the lighter brown. That's acceptable because the chart is decorative, hidden from assistive tech and labeled illustrative.
- **Fades:** four mask layers.
  - Faint under the copy column.
  - Soft top and bottom edges.
  - An ellipse that recedes behind the portrait's soft edges.
  - A bottom-left fade so the volume bars stay quiet under the shortcuts.
- **Mobile:** the chart shows mainly at the sides of the portrait and as volume below it. The headshot's opaque backdrop covers the middle of the chart.
