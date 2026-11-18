# Hero chart prototype

A standalone preview of a replacement for the homepage hero chart. Nothing outside this folder is changed; the homepage (`index.html`), shared styles (`css/site.css`) and existing scripts are only referenced, never edited.

## Preview

From the repository root:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/chart-prototype/

The floating **Prototype** toolbar (bottom left) is for review only:

- **Candles / Line**: switch the chart style.
- **Pause**: freeze the animation.
- **Show current**: swap back to the existing static SVG chart for a side-by-side comparison.

## What changes compared with the current hero

| | Current | Prototype |
|---|---|---|
| Chart | Static `assets/hero-candles.svg` with a CSS drift, plus an optional TradingView iframe | Self-hosted `<canvas>` chart with seeded, illustrative data |
| Motion | Whole image slides left and right | The latest candle ticks; a new candle rolls in every few seconds |
| Overlays | None | 20-period moving average (soft glow), ±2σ band, volume, pulsing last-price marker |
| Third-party requests | TradingView script and iframe on demand | None |
| Controls row | "Live overlay" button and TradingView link | "Illustrative index" readout with price and change |
| Palette | Green and red candles | Champagne (up) and muted rose (down), from the hero palette |

Behavior details:

- Stops animating when the hero is off-screen or the tab is hidden.
- With `prefers-reduced-motion: reduce`, it draws one still frame.
- The chart stays decorative (`aria-hidden`, `inert`), as the current one is.
- Data is generated from a fixed seed (`data-seed`), so the starting chart looks the same on every load.

## Files

- `index.html`: copy of the homepage hero with the prototype chart mounted
- `hero-chart-proto.js`: the chart component (no dependencies)
- `hero-chart-proto.css`: component styles plus the review toolbar styles

## Integration (not done; waiting for approval)

1. Move `hero-chart-proto.js` to `js/` and its component rules (without `.proto-toolbar` and `.hero-chart-current`) into `css/site.css`.
2. In `index.html`, replace `.hero-chart-sample` and the TradingView container with the `[data-hero-chart]` mount, and replace the controls row with the readout.
3. Remove `js/hero-chart.js` and, if unused elsewhere, `assets/hero-candles.svg` and the TradingView CSS rules.
