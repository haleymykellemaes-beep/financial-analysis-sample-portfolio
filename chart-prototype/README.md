# Hero candlestick background (prototype)

A decorative candlestick and volume chart for the homepage hero, built to sit behind the portrait. It uses plain HTML, CSS and JavaScript, with no dependencies and no network requests. Nothing outside this folder has been changed. The homepage (`index.html`), `css/site.css` and the existing scripts are only referenced.

## Preview

From the repository root:

```bash
python3 -m http.server 8765
```

There are two previews of the same chart, linked from each other's review panel:

- http://localhost:8765/chart-prototype/ (`index.html`) uses the current masked headshot.
- http://localhost:8765/chart-prototype/desk.html uses the desk photo as a soft cutout (see [Desk photo variant](#desk-photo-variant)).

The review panel under the hero shows the newest candle's values and has two buttons:

- **Apply test update** revises the newest candle. Each click applies the next of three fixed updates: up, down, then up.
- **Reset to fixture** restores the newest candle to its fixture values.

## Files

| File | Purpose |
|---|---|
| `candle-backdrop.js` | The component (`window.CandleBackdrop`) |
| `candle-backdrop.css` | Component styles, all scoped to `.candle-backdrop` |
| `ohlcv-fixture.js` | Fixed, labeled OHLCV fixture: 240 synthetic daily candles, not market data |
| `hero-placement.css` | Homepage-specific placement, fades and sizing (moves into `site.css` on integration) |
| `index.html`, `preview.css` | Standalone preview (current headshot) and its review panel (prototype only) |
| `desk.html`, `desk-placement.css` | Desk-photo variant of the preview, and the placement rules it adds on top of `hero-placement.css` |
| `assets/haley-desk-cutout.webp` | The desk photo as a soft cutout with transparency (1152 × 941) |
| `tools/make-cutout.py` | Rebuilds the cutout from the original photo and a person matte |
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

The chart is drawn on two canvases. History and grid are drawn once on the base layer, and the newest candle has its own layer, so an update cannot disturb anything else. Each canvas pixel maps to exactly one device pixel, and the fade mask sits on an inner stage element rather than on the container. Together these keep every edge crisp when the container lands on a fractional position: measured on both previews at both sizes, each 1px grid line covers exactly 2 device rows at 2× density.

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

**If the desk photo is chosen instead,** also:

- Copy `assets/haley-desk-cutout.webp` to `assets/` and append the rules from `desk-placement.css` to `css/site.css` after the `hero-placement.css` rules.
- Replace the portrait image with:

  ```html
  <img class="hero-portrait hero-portrait--desk" src="assets/haley-desk-cutout.webp" alt="Portrait of Haley Maes at her desk" width="1152" height="941" fetchpriority="high" />
  ```

The desk rules make the hero about 50px taller on desktop, so its new height is part of the change.

## Acceptance checks

With the server running:

```bash
node chart-prototype/checks/acceptance.js
```

To check the desk page, pass its URL: `node chart-prototype/checks/acceptance.js http://localhost:8765/chart-prototype/desk.html`.

The script writes screenshots and `results.json` to `chart-prototype/checks/output/`, which git ignores. It captures the hero in viewport-sized tiles by scrolling, not with a full-page capture: a full-page capture briefly resizes the page, which resizes and refits the chart. At 1440 × 900 and 390 × 844 (2× pixel density) it checks:

- **Stillness:** the hero is pixel-identical at rest and 10 seconds later, and the chart box hasn't moved.
- **Overflow:** there is no horizontal page overflow.
- **Clarity:** how much the chart changes the headline, tagline, description, buttons, shortcuts and face, comparing the chart shown and hidden. The limit is a mean change of 3/255 over text and 0.5/255 over the face. The face box comes from the portrait's `data-face` attribute.
- **Chart beside the silhouette** (desk page only): the boxes in the portrait's `data-beside` attribute, beside each shoulder, must show the chart, with a mean change of at least 2/255.
- **Clicks:** both hero buttons receive clicks.
- **Keyboard:** the chart is inert, hidden from assistive tech, has `pointer-events: none`, and focus never enters it over 25 Tab presses.
- **Updates:** each demo test update changes only the newest candle's column, in both the price and volume panes. The price scale holds and the history layer stays byte-identical.
- **Clipping:** an update far outside the locked range stays clipped inside that column.

Last run: headshot page 32/32 passed, desk page 36/36 passed.

## Design notes

- **Color:** muted teal `#58a593` (up) and terracotta `#c9744f` (down). The skill's palette validator passes them for color-blind separation (ΔE 9.1) and normal-vision separation (ΔE 18.6). They sit below its chroma floor by request ("muted"), and terracotta is under 3:1 contrast on the lighter brown. That's acceptable because the chart is decorative, hidden from assistive tech and labeled illustrative.
- **Fades:** four mask layers.
  - Faint under the copy column.
  - Soft top and bottom edges.
  - An ellipse that recedes behind the portrait's soft edges.
  - A bottom-left fade so the volume bars stay quiet under the shortcuts.
- **Mobile:** the chart shows mainly at the sides of the portrait and as volume below it. The headshot's opaque backdrop covers the middle of the chart.

## Desk photo variant

`desk.html` swaps the masked headshot for the wider desk photo, cut out along the hair, shoulders and jacket so the chart shows around the silhouette.

- **Scale:** the whole photo is scaled so the eyes are 84px apart on a 1440px-wide screen, against 126px for the current headshot. That makes the face about a third smaller.
- **Framing:** the photo is anchored to the bottom right, so the desk and laptop show along the bottom of the hero. On desktop the hero grows by about 50px (`min-height: clamp(660px, 54vw, 860px)`) to fit them; it still fits a 1440 × 900 screen.
- **Chart band:** the chart ends just above the laptop. The newest candles and their volume bars sit beside the left shoulder, and the rally sits beside the hair. The ellipse that dimmed the chart behind the headshot is no longer needed.
- **Caption:** "Chart: illustrative data" moves to the bottom left, because the laptop fills the bottom-right corner.
- **Mobile:** the photo band runs full-bleed under the buttons. The desk fades out at the bottom of the photo instead of ending in a hard line.

**How the cutout was made** (`tools/make-cutout.py`):

1. **Person matte:** from the BiRefNet "general" matting model, run locally with ONNX Runtime using the build the rembg project publishes. It kept more hair detail than the portrait model.
2. **Chair:** the model treats the wicker chair as background, so it is removed and the chart shows beside the shoulders.
3. **Laptop:** traced as a polygon, because the model drops it.
4. **Desk:** kept below the wall line, fading out toward the copy.
5. **Edges:** the beige wall is removed from semi-transparent hair and jacket edges, and the matte is feathered slightly. Fully opaque pixels, including the face, keep their original colours.

The original photo and the model aren't in the repository, so the script takes them as arguments.

**Limitation:** the source photo is 1672px wide. At this size it displays near its native resolution on standard screens, but on 2× (retina) screens it is upscaled about 1.8×, so it looks slightly softer than the headshot. A higher-resolution original would fix that with no other changes.
