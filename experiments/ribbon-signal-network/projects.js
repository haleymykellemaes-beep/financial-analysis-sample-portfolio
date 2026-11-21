/*
 * The six portfolio studies: the single source for every title, description,
 * tool list and destination the Ribbon Signal Network shows (nodes, preview
 * cards, the "six studies" strip and the phone sequence).
 *
 * - href: a real in-page destination, or null until that project exists.
 *   Null nodes still preview on hover, focus and tap; they never link.
 * - tools: confirmed tools only. Leave empty rather than guess.
 * - label: the short node label, one entry per line.
 * - theme: navigation grouping (financial, risk, exploratory). These are
 *   portfolio themes, not measured relationships between the projects.
 * - at: desktop composition anchor [x%, y%] of the hero, from the design
 *   reference. js/network.js fits these into the real space between the
 *   copy and the portrait, so they are a starting point, not fixed pixels.
 */
window.RSN_PROJECTS = Object.freeze([
  {
    id: "01",
    title: "A/R Aging & Working Capital",
    label: ["A/R Aging"],
    category: "Financial Operations",
    tools: ["Excel", "Python", "SQLite"],
    description: "Explore outstanding receivables, aging patterns, and working capital implications.",
    href: "#project-receivables",
    theme: "financial",
    at: [36, 31]
  },
  {
    id: "02",
    title: "Student Performance Risk",
    label: ["Student Risk"],
    category: "Predictive Risk",
    tools: ["SQL"],
    description: "Identify student performance patterns and explore indicators associated with academic risk.",
    href: null,
    theme: "risk",
    at: [60, 24]
  },
  {
    id: "03",
    title: "Revenue Intelligence & Forecasting",
    label: ["Revenue", "Forecast"],
    category: "Revenue Analytics",
    tools: ["SQL", "Python"],
    description: "Investigate revenue performance, cohort behavior, and forward-looking scenarios.",
    href: "#project-revenue",
    theme: "financial",
    hub: true,
    at: [47, 47]
  },
  {
    id: "04",
    title: "Film Revenue & Genre",
    label: ["Film & Genre"],
    category: "Exploratory Analysis",
    tools: ["Python"],
    description: "Explore relationships between film genres, revenue, and performance patterns.",
    href: null,
    theme: "exploratory",
    at: [33, 58]
  },
  {
    id: "05",
    title: "Nike Revenue & Channels",
    label: ["Nike", "Channels"],
    category: "Business Intelligence",
    tools: ["Tableau"],
    description: "Examine revenue distribution and performance across business channels.",
    href: null,
    theme: "financial",
    at: [62, 55]
  },
  {
    id: "06",
    title: "Transaction Anomaly Detection",
    label: ["Anomalies"],
    category: "Anomaly Detection",
    tools: [],
    description: "Identify unusual transactions and investigate patterns that may warrant further review.",
    href: "#project-anomalies",
    theme: "risk",
    at: [48, 74]
  }
]);
