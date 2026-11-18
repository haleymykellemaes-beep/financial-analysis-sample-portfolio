# Financial Analysis Sample Portfolio

Haley Maes. A working outline for a financial analysis sample portfolio, separate from the data analytics site. The name and structure are meant to be revised.

Preview by opening `index.html`, or from this folder:

```bash
python3 -m http.server 8765
```

Then visit http://localhost:8765

The expected-value simulator is at `projects/sports-market/`. It calculates from the odds, probability, and stake you enter. Other project figures are labeled illustrative.

## Structure

- **Themes:** six themes (Classic, Haley's Choice, Mile High, Liquidity, Flow, Surge), chosen with the picker in the navigation and remembered across pages. All colours and effects are in `css/themes.css`; `js/theme.js` applies and saves the choice. New visitors see Haley's Choice.
- `index.html`: the homepage. It loads `js/theme.js` in the `<head>`, then `css/site.css`, `css/themes.css`, `css/candle-backdrop.css` and `css/home.css` (layout). Its scripts are `js/nav.js`, the hero chart (`js/ohlcv-fixture.js`, `js/candle-backdrop.js`, `js/home-hero.js`), the optional TradingView live overlay (`js/hero-chart.js`) and the project-card animations (`js/thumbnails.js`).
- `projects/<name>/index.html`: one folder per project. Project pages load `js/theme.js`, `css/site.css` and `css/themes.css`, so they follow the chosen theme while staying independent of the homepage layout.
- `css/site.css`: styles shared by every page.
- `dev/`: acceptance checks and asset scripts for the homepage hero and its decor. `dev/README.md` covers the themes, the chart API, adding project pages, and how to run the checks.
