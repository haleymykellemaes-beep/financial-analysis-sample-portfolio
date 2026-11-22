# Editorial orbit homepage (preview)

A homepage preview for the data analytics portfolio: the name across the top, the headshot at the centre, six project nodes around it, and a black card that shows the study under the pointer. It is self-contained in this folder. It changes no other page, and the case studies it links to are untouched.

From the repository root:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/experiments/editorial-orbit/

## Files

| File | Purpose |
|---|---|
| `index.html` | The page: hero, toolbox, work, about and contact. |
| `projects.js` | The six studies: titles, node labels, tools, summaries, case-study URLs, chart figures and positions. The only place that content lives. |
| `orbit.js` | Builds the nodes, card, charts and work cards from `projects.js`; lays out the hero; handles hover, focus, tap and Escape; plays the opening and the scroll hand-off. |
| `orbit.css` | Colour, type and layout tokens; desktop and stacked layouts. |
| `assets/haley-headshot.webp` | The black-and-white headshot on a transparent background, as supplied (lossless). |
| `tools/make_headshot_cutout.py` | Cuts a new photo out of its background if one isn't supplied already cut out (BiRefNet portrait matte; only the semi-transparent hair edges are recoloured, every opaque pixel is the original). |
| `assets/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | The tab icon: "HM" in Libre Caslon Display, the title's typeface, as outlines. Dark tile in dark mode. |
| `tools/make_favicon.py` | Rebuilds `favicon.svg` from the font file. |
| `assets/Haley-Maes-Resume.pdf` | The résumé linked from About and the footer. |

## Content

Every number on the cards and in the work section is one the linked case study already publishes. Nothing is estimated.

| # | Study | Links to |
|---|---|---|
| 01 | Accounts Receivable Aging Analysis | haleymykellemaes-beep.github.io/new/ar-tracker.html |
| 02 | Student Performance Risk Analysis | /new/student-performance-sql.html |
| 03 | Revenue Intelligence & Forecasting (featured) | /financial-analysis-sample-portfolio/projects/revenue-intelligence/ |
| 04 | Film Revenue & Genre Analysis | /new/tmdb-revenue.html |
| 05 | Nike Revenue & Channel Performance | /new/nike.html |
| 06 | Transaction Anomaly Detection | /new/transaction-anomaly.html |

To change a study, its order or its spot in the hero, edit its entry in `projects.js` (`slot`: l1–l3 down the left, r1–r3 down the right).

## Behaviour

- **Desktop** (1240px and wider, landscape): laid out on an artboard in the reference image's proportions, scaled to the window. The portrait keeps its hair just under the name and is cropped at the chest by the bottom edge (`CROP` in `orbit.js`). Nodes start at the reference positions and move only as far as needed to stay clear of the headline, the card, the portrait and each other.
- **Hover or keyboard focus on a node:** the card changes to that study, its curves turn rose with a soft pulse, and the other nodes recede. The selection holds while the pointer crosses to the card; leaving the hero or pressing Escape returns to the featured study. Clicking anywhere on the card opens the case study.
- **Phones and upright tablets:** name, headline, portrait, then the six studies as large tap targets and the card below. A tap selects a study and a separate tap on View Case Study opens it.
- **Reduced motion:** no opening, pulse or scroll motion; the card changes instantly.
