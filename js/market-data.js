/* Shared loader for the Python-generated sample. The page still runs if the file is missing. */
window.MarketData = fetch("data/market.json", { cache: "no-cache" })
  .then((response) => (response.ok ? response.json() : null))
  .catch(() => null);
