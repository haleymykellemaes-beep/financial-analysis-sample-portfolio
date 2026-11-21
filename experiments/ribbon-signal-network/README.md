# Ribbon Signal Network (experiment)

A preview-only homepage hero for the future data analytics portfolio. It is not linked from the site and does not change the live homepage, its styles or scripts, the project pages, the thumbnails or any image.

From the repository root:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/experiments/ribbon-signal-network/ and add `?intro` to replay the opening sequence, which otherwise plays once per browser session.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page. The hero is new; the sections below it are copied from `/index.html` with their paths adjusted, so the nav, buttons and project links resolve. It loads `css/home.css`, `css/palette.css`, `js/work.js` and the shared images by relative path. |
| `projects.js` | The six studies: titles, short labels, categories, confirmed tools, descriptions, destinations and composition anchors. This is the only place that content lives. |
| `network.js` | Fits the nodes between the copy and the portrait, draws the pathways (SVG), builds the nodes, preview cards and strip from `projects.js`, and handles hover, focus, click, touch and Escape. Exposes `window.HMSignal` in the same shape as `js/signal.js`. |
| `motion.js` | The opening sequence, silk drift and scroll motion (GSAP), forked from `js/home.js`. |
| `rsn.css` | The locked palette, scoped to this page, and every hero, node, card, strip and responsive style. |
| `shared/` | Unedited snapshots of `css/home-base.css`, `css/home-themes.css` and `js/home-nav.js` from `main`, so the page renders the same on branches that don't have them (the Pages branch doesn't). |

## How it behaves

- **Layout:** on desktop and landscape tablets the anchors in `projects.js` are fitted into the space between the copy and the portrait, then moved clear of the text, the silhouette and each other. If the labels don't fit, the nodes show numbers only and the strip under the hero names them. Stacked layouts list the six studies under the portrait: one column on phones, three on upright tablets.
- **Links:** only 01, 03 and 06 link, to the existing gallery cards (`#project-receivables`, `#project-revenue`, `#project-anomalies`). The other three are buttons that pin their preview. To link one later, set its `href` in `projects.js`.
- **Pathways:** they show portfolio themes (financial 01, 03, 05; risk 02, 06; exploratory 04), not measured relationships between the projects.
- **Reduced motion:** no opening, drift or transitions.
