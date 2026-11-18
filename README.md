# Financial Analysis Sample Portfolio

Haley Maes. A working outline for a financial analysis sample portfolio, separate from the data analytics site. The name and structure are meant to be revised.

Preview by opening `index.html`, or from this folder:

```bash
python3 -m http.server 8765
```

Then visit http://localhost:8765

The expected-value simulator is at `projects/sports-market/`. It calculates from the odds, probability, and stake you enter. Other project figures are labeled illustrative.

## Structure

- `index.html`: the homepage. It loads `css/site.css`, then the homepage-only files: `css/themes/classic-espresso.css` (the active theme's colours), `css/candle-backdrop.css` and `css/home.css` (layout). Its scripts are `js/nav.js`, the hero chart (`js/ohlcv-fixture.js`, `js/candle-backdrop.js`, `js/home-hero.js`) and the optional TradingView live overlay (`js/hero-chart.js`).
- `projects/<name>/index.html`: one folder per project. Project pages load `css/site.css` only, so they're independent of the homepage design.
- `css/site.css`: styles shared by every page.
- `dev/`: acceptance checks and asset scripts for the homepage hero. `dev/README.md` covers the chart API, adding project pages, themes, and how to run the checks.
