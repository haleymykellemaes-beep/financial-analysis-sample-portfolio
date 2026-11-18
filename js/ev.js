(function () {
  var form = document.getElementById("ev-form");
  if (!form) return;

  var oddsInput = document.getElementById("odds");
  var probInput = document.getElementById("prob");
  var stakeInput = document.getElementById("stake");
  var probOut = document.getElementById("prob-out");
  var errorEl = document.getElementById("ev-error");
  var impliedEl = document.getElementById("out-implied");
  var decimalEl = document.getElementById("out-decimal");
  var edgeEl = document.getElementById("out-edge");
  var evEl = document.getElementById("out-ev");
  var noteEl = document.getElementById("out-note");
  var barImplied = document.getElementById("bar-implied");
  var barEstimate = document.getElementById("bar-estimate");

  function money(value) {
    var sign = value < 0 ? "−" : "";
    return sign + "$" + Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function percent(value) {
    return (value * 100).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + "%";
  }

  function clearOutputs(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
    impliedEl.textContent = "—";
    decimalEl.textContent = "—";
    edgeEl.textContent = "—";
    evEl.textContent = "—";
    evEl.className = "";
    edgeEl.className = "";
    noteEl.textContent = "Enter American odds of −100 or lower, or +100 or higher.";
    barImplied.style.width = "0%";
    barEstimate.style.width = "0%";
  }

  function render() {
    var american = Number(oddsInput.value);
    var probability = Number(probInput.value) / 100;
    var stake = Number(stakeInput.value);
    probOut.textContent = Number(probInput.value).toFixed(0) + "%";

    if (!Number.isFinite(american) || (american > -100 && american < 100)) {
      clearOutputs("American odds need to be −100 or lower, or +100 or higher.");
      return;
    }
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      clearOutputs("Estimated probability must be between 1% and 99%.");
      return;
    }
    if (!Number.isFinite(stake) || stake <= 0) {
      clearOutputs("Stake must be greater than zero.");
      return;
    }

    var decimal = american >= 100 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
    var implied = 1 / decimal;
    var profit = stake * (decimal - 1);
    var expected = probability * profit - (1 - probability) * stake;
    var edge = probability - implied;

    errorEl.hidden = true;
    impliedEl.textContent = percent(implied);
    decimalEl.textContent = decimal.toFixed(2);
    edgeEl.textContent = (edge >= 0 ? "+" : "−") + Math.abs(edge * 100).toFixed(1) + " pp";
    edgeEl.className = edge >= 0 ? "pos" : "neg";
    evEl.textContent = money(expected);
    evEl.className = expected >= 0 ? "pos" : "neg";
    barImplied.style.width = Math.max(0, Math.min(100, implied * 100)) + "%";
    barEstimate.style.width = Math.max(0, Math.min(100, probability * 100)) + "%";
    noteEl.textContent = "At this price, a " + money(stake) + " stake profits " + money(profit)
      + " if it wins. Expected value is the probability-weighted result of that profit and a full loss of the stake.";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });
  form.addEventListener("input", render);
  render();
})();
