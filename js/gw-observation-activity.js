// GridWild cached-observation activity timelines.

(function () {
  const STYLE_ID = "gwObservationActivityStyles";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatNum(x) {
    return Number(x || 0).toLocaleString();
  }

  function isoDayFromDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseObservationDate(obs) {
    const raw = obs?.time_observed_at || obs?.observed_on || obs?.created_at || "";
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split("-").map(Number);
      return new Date(year, month - 1, day);
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function parseObservationHour(obs) {
    const raw = obs?.time_observed_at || "";
    if (raw) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date.getHours();
    }

    const observed = obs?.observed_on || "";
    if (/\d{2}:\d{2}/.test(observed)) {
      const date = new Date(observed);
      if (!Number.isNaN(date.getTime())) return date.getHours();
    }

    return null;
  }

  function getDisplayName(obs) {
    return obs?.taxon || obs?.common_name || obs?.scientific_name || "Unknown taxon";
  }

  function getObservationUrl(obs) {
    return obs?.uri || (obs?.id ? `https://www.inaturalist.org/observations/${encodeURIComponent(obs.id)}` : "");
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .gw-obs-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99997;
        background: rgba(8,12,10,0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        box-sizing: border-box;
      }

      .gw-obs-editor {
        width: min(520px, 96vw);
        max-height: 92vh;
        overflow: auto;
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
        color: #efe6d3;
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        padding: 14px;
        box-sizing: border-box;
      }

      .gw-obs-btn {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 11px 12px;
        font-weight: 900;
        cursor: pointer;
        background: rgba(255,255,255,0.12);
        color: #efe6d3;
      }

      .gw-observation-gallery-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 14px;
      }

      .gw-observation-gallery-title {
        color: #f0d18a;
        font-size: 22px;
        font-weight: 950;
        line-height: 1.1;
      }

      .gw-observation-gallery-subtitle {
        color: rgba(239,230,211,0.68);
        font-size: 12px;
        margin-top: 4px;
      }

      .gw-activity-modal {
        width: min(980px, 96vw);
        max-height: 92vh;
        padding-bottom: 16px;
      }

      .gw-activity-summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }

      .gw-activity-kpi {
        border: 1px solid rgba(215,183,116,0.16);
        border-radius: 14px;
        background: rgba(255,255,255,0.06);
        padding: 10px;
      }

      .gw-activity-kpi-value {
        color: #f4e8cf;
        font-size: 19px;
        font-weight: 950;
      }

      .gw-activity-kpi-label {
        color: rgba(239,230,211,0.62);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        margin-top: 2px;
      }

      .gw-activity-panels {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
        gap: 12px;
        align-items: start;
      }

      .gw-activity-panel {
        border: 1px solid rgba(215,183,116,0.18);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035)),
          radial-gradient(circle at 18% 0%, rgba(119,161,87,0.18), transparent 42%);
        padding: 12px;
      }

      .gw-activity-panel-title {
        color: #f0d18a;
        font-size: 14px;
        font-weight: 950;
        margin-bottom: 3px;
      }

      .gw-activity-panel-sub {
        color: rgba(239,230,211,0.62);
        font-size: 11px;
        line-height: 1.3;
        margin-bottom: 10px;
      }

      .gw-activity-calendar-wrap {
        overflow-x: auto;
        padding-bottom: 4px;
      }

      .gw-activity-calendar {
        display: grid;
        grid-template-columns: 32px repeat(var(--gw-activity-weeks), 16px);
        grid-template-rows: 18px repeat(7, 16px);
        gap: 4px;
        min-width: max-content;
      }

      .gw-activity-month {
        color: rgba(240,209,138,0.78);
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
      }

      .gw-activity-weekday {
        color: rgba(239,230,211,0.52);
        font-size: 9px;
        line-height: 16px;
        text-align: right;
        padding-right: 3px;
      }

      .gw-activity-day {
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 1px solid rgba(215,183,116,0.14);
        background: rgba(255,255,255,0.055);
        cursor: pointer;
        padding: 0;
      }

      .gw-activity-day[data-count="0"] {
        cursor: default;
      }

      .gw-activity-day.is-selected {
        outline: 2px solid #f0d18a;
        outline-offset: 1px;
      }

      .gw-activity-clock {
        display: grid;
        grid-template-columns: repeat(24, minmax(8px, 1fr));
        gap: 5px;
        align-items: end;
        height: 190px;
        padding: 12px 4px 0;
        border-radius: 14px;
        background: rgba(10,14,11,0.26);
        border: 1px solid rgba(215,183,116,0.12);
      }

      .gw-activity-hour {
        appearance: none;
        position: relative;
        border: 0;
        padding: 0;
        height: 100%;
        background: transparent;
        cursor: pointer;
      }

      .gw-activity-hour-bar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 18px;
        min-height: 3px;
        border-radius: 999px 999px 3px 3px;
        background: linear-gradient(180deg, #f0d18a, #5f8f55);
        box-shadow: 0 0 12px rgba(240,209,138,0.16);
      }

      .gw-activity-hour.is-selected .gw-activity-hour-bar {
        background: linear-gradient(180deg, #ffe7a3, #88c06d);
        box-shadow: 0 0 0 2px rgba(240,209,138,0.36);
      }

      .gw-activity-hour-label {
        position: absolute;
        left: 50%;
        bottom: 0;
        transform: translateX(-50%);
        color: rgba(239,230,211,0.52);
        font-size: 9px;
      }

      .gw-activity-detail {
        margin-top: 12px;
        border-radius: 14px;
        border: 1px solid rgba(215,183,116,0.14);
        background: rgba(255,255,255,0.05);
        padding: 10px;
      }

      .gw-activity-detail-title {
        color: #f4e8cf;
        font-weight: 950;
        font-size: 13px;
        margin-bottom: 7px;
      }

      .gw-activity-list {
        display: grid;
        gap: 6px;
        max-height: 190px;
        overflow: auto;
      }

      .gw-activity-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 12px;
      }

      .gw-activity-create-wildlist {
        border: 1px solid rgba(240,209,138,0.42);
        background: linear-gradient(180deg, #f0d18a, #b8893e);
        color: #201510;
        box-shadow: 0 8px 22px rgba(0,0,0,0.20);
      }

      .gw-activity-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
        color: #efe6d3;
        text-decoration: none;
        border-radius: 10px;
        padding: 7px 8px;
        background: rgba(255,255,255,0.055);
      }

      .gw-activity-row-name {
        font-size: 12px;
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-activity-row-meta {
        color: rgba(239,230,211,0.58);
        font-size: 10px;
        white-space: nowrap;
      }

      @media (max-width: 760px) {
        .gw-activity-summary,
        .gw-activity-panels {
          grid-template-columns: 1fr;
        }

        .gw-activity-clock {
          gap: 3px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function summarize(observations) {
    const days = new Map();
    const hours = Array.from({ length: 24 }, () => []);
    const unknownHour = [];
    let minDate = null;
    let maxDate = null;

    observations.forEach(obs => {
      const date = parseObservationDate(obs);
      if (!date) return;

      const dayKey = isoDayFromDate(date);
      if (!days.has(dayKey)) days.set(dayKey, []);
      days.get(dayKey).push(obs);

      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;

      const hour = parseObservationHour(obs);
      if (hour == null) {
        unknownHour.push(obs);
      } else {
        hours[hour].push(obs);
      }
    });

    return { days, hours, unknownHour, minDate, maxDate };
  }

  function getCalendarRange(summary) {
    const end = summary.maxDate ? new Date(summary.maxDate) : new Date();
    const start = summary.minDate ? new Date(summary.minDate) : new Date(end.getTime() - 27 * DAY_MS);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()));

    return { start, end };
  }

  function densityColor(count, maxCount) {
    if (!count) return "rgba(255,255,255,0.055)";
    const t = Math.max(0.18, Math.min(1, count / Math.max(1, maxCount)));
    const light = 24 + Math.round(t * 42);
    return `hsl(94 34% ${light}%)`;
  }

  function renderCalendar(summary, selectedDay) {
    const { start, end } = getCalendarRange(summary);
    const maxCount = Math.max(1, ...Array.from(summary.days.values()).map(list => list.length));
    const days = [];
    const monthLabels = [];
    const totalDays = Math.floor((end - start) / DAY_MS) + 1;
    const weeks = Math.ceil(totalDays / 7);

    for (let w = 0; w < weeks; w++) {
      const d = new Date(start.getTime() + w * 7 * DAY_MS);
      if (d.getDate() <= 7 || w === 0) {
        monthLabels.push(`<div class="gw-activity-month" style="grid-column:${w + 2};grid-row:1;">${MONTH_LABELS[d.getMonth()]}</div>`);
      }
    }

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(start.getTime() + i * DAY_MS);
      const key = isoDayFromDate(date);
      const count = summary.days.get(key)?.length || 0;
      const week = Math.floor(i / 7);
      const day = date.getDay();
      const label = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
      days.push(`
        <button
          class="gw-activity-day ${key === selectedDay ? "is-selected" : ""}"
          type="button"
          data-day="${esc(key)}"
          data-count="${count}"
          title="${esc(label)}: ${formatNum(count)} observation${count === 1 ? "" : "s"}"
          style="grid-column:${week + 2};grid-row:${day + 2};background:${densityColor(count, maxCount)};"
          aria-label="${esc(label)}: ${formatNum(count)} observation${count === 1 ? "" : "s"}"
        ></button>
      `);
    }

    return `
      <div class="gw-activity-calendar" style="--gw-activity-weeks:${weeks};">
        ${monthLabels.join("")}
        ${WEEKDAY_LABELS.map((label, i) => `<div class="gw-activity-weekday" style="grid-column:1;grid-row:${i + 2};">${label}</div>`).join("")}
        ${days.join("")}
      </div>
    `;
  }

  function renderClock(summary, selectedHour) {
    const maxCount = Math.max(1, ...summary.hours.map(list => list.length));
    return summary.hours.map((list, hour) => {
      const height = Math.max(3, (list.length / maxCount) * 150);
      const label = hour === 0 ? "12a" : hour === 12 ? "12p" : hour % 6 === 0 ? String(hour > 12 ? hour - 12 : hour) : "";
      return `
        <button
          class="gw-activity-hour ${hour === selectedHour ? "is-selected" : ""}"
          type="button"
          data-hour="${hour}"
          title="${hourLabel(hour)}: ${formatNum(list.length)} observation${list.length === 1 ? "" : "s"}"
          aria-label="${hourLabel(hour)}: ${formatNum(list.length)} observation${list.length === 1 ? "" : "s"}"
        >
          <span class="gw-activity-hour-bar" style="height:${height}px;"></span>
          <span class="gw-activity-hour-label">${esc(label)}</span>
        </button>
      `;
    }).join("");
  }

  function hourLabel(hour) {
    const suffix = hour < 12 ? "AM" : "PM";
    const display = hour % 12 || 12;
    return `${display}:00 ${suffix}`;
  }

  function formatDateRange(summary) {
    if (!summary.minDate || !summary.maxDate) return "No dated observations";
    const fmt = { month: "short", day: "numeric", year: "numeric" };
    return `${summary.minDate.toLocaleDateString([], fmt)} - ${summary.maxDate.toLocaleDateString([], fmt)}`;
  }

  function formatSelectionTitle(selection) {
    return selection?.title || "Activity Wildlist";
  }

  function renderObservationRows(observations) {
    const rows = observations.slice(0, 30).map(obs => {
      const url = getObservationUrl(obs);
      const date = parseObservationDate(obs);
      const observed = date
        ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "unknown";
      const row = `
        <span class="gw-activity-row-name">${esc(getDisplayName(obs))}</span>
        <span class="gw-activity-row-meta">${esc(observed)}</span>
      `;
      return url
        ? `<a class="gw-activity-row" href="${esc(url)}" target="_blank" rel="noopener">${row}</a>`
        : `<div class="gw-activity-row">${row}</div>`;
    }).join("");

    if (!observations.length) {
      return `<div class="gw-observation-gallery-subtitle">No observations in this slice yet.</div>`;
    }

    return `
      <div class="gw-activity-list">
        ${rows}
      </div>
      ${observations.length > 30 ? `<div class="gw-observation-gallery-subtitle" style="margin-top:7px;">Showing 30 of ${formatNum(observations.length)} observations.</div>` : ""}
    `;
  }

  function open() {
    injectStyles();

    const observations = window.GridWildRecentINat?.getRecentObservations?.() || [];
    if (!observations.length) {
      alert("No cached recent observations are available yet.");
      return;
    }

    const summary = summarize(observations);
    let selectedDay = summary.maxDate ? isoDayFromDate(summary.maxDate) : null;
    let selectedHour = null;

    const modal = document.createElement("div");
    modal.className = "gw-obs-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "gwObservationActivityTitle");

    const close = () => modal.remove();

    function currentSelection() {
      if (selectedHour != null) {
        return {
          title: `${hourLabel(selectedHour)} Activity`,
          mode: "hour",
          observations: summary.hours[selectedHour] || []
        };
      }

      return {
        title: selectedDay ? `${selectedDay} Timeline` : "Timeline",
        mode: "day",
        observations: selectedDay ? (summary.days.get(selectedDay) || []) : observations
      };
    }

    function createSelectedWildlist() {
      const selection = currentSelection();

      if (!window.GridWildPlaylists?.createFromObservations) {
        alert("Wildlists are not loaded yet.");
        return;
      }

      if (!selection.observations.length) {
        alert("No observations are selected for this Wildlist.");
        return;
      }

      const title = formatSelectionTitle(selection).replace(/\s+Timeline$/, "");
      const playlist = window.GridWildPlaylists.createFromObservations(selection.observations, {
        title,
        description: `Created from GridWild Activity: ${selection.title}.`,
        mode: "activity",
        template: {
          type: "activity",
          selectionMode: selection.mode,
          selectedDay,
          selectedHour
        },
        open: true
      });

      if (playlist) close();
    }

    function render() {
      const knownHourCount = summary.hours.reduce((sum, list) => sum + list.length, 0);
      const selection = currentSelection();
      modal.innerHTML = `
        <div class="gw-obs-editor gw-activity-modal">
          <div class="gw-observation-gallery-head">
            <div>
              <div class="gw-observation-gallery-title" id="gwObservationActivityTitle">Activity</div>
              <div class="gw-observation-gallery-subtitle">
                Cached observations from ${esc(window.__gwUser?.username || "this user")} across ${esc(formatDateRange(summary))}.
              </div>
            </div>
            <button class="gw-obs-btn" id="gwObservationActivityCloseBtn" type="button">Close</button>
          </div>

          <div class="gw-activity-summary">
            <div class="gw-activity-kpi">
              <div class="gw-activity-kpi-value">${formatNum(observations.length)}</div>
              <div class="gw-activity-kpi-label">Cached</div>
            </div>
            <div class="gw-activity-kpi">
              <div class="gw-activity-kpi-value">${formatNum(summary.days.size)}</div>
              <div class="gw-activity-kpi-label">Active Days</div>
            </div>
            <div class="gw-activity-kpi">
              <div class="gw-activity-kpi-value">${formatNum(knownHourCount)}</div>
              <div class="gw-activity-kpi-label">Timed Records</div>
            </div>
          </div>

          <div class="gw-activity-panels">
            <section class="gw-activity-panel">
              <div class="gw-activity-panel-title">Timeline</div>
              <div class="gw-activity-panel-sub">Tap a day to inspect cached observation density.</div>
              <div class="gw-activity-calendar-wrap">
                ${renderCalendar(summary, selectedDay)}
              </div>
              <div class="gw-activity-detail">
                <div class="gw-activity-detail-title">${esc(selection.title)}</div>
                ${renderObservationRows(selection.observations)}
              </div>
            </section>

            <section class="gw-activity-panel">
              <div class="gw-activity-panel-title">Day Clock</div>
              <div class="gw-activity-panel-sub">
                Hourly frequency from cached observations with observation times${summary.unknownHour.length ? `; ${formatNum(summary.unknownHour.length)} records only have dates.` : "."}
              </div>
              <div class="gw-activity-clock">
                ${renderClock(summary, selectedHour)}
              </div>
            </section>
          </div>

          <div class="gw-activity-actions">
            <button
              class="gw-obs-btn gw-activity-create-wildlist"
              id="gwActivityCreateWildlistBtn"
              type="button"
              ${selection.observations.length ? "" : "disabled"}
            >
              Create Wildlist
            </button>
          </div>
        </div>
      `;

      modal.querySelector("#gwObservationActivityCloseBtn").onclick = close;
      modal.querySelector("#gwActivityCreateWildlistBtn")?.addEventListener("click", evt => {
        evt.preventDefault();
        createSelectedWildlist();
      });

      modal.querySelectorAll(".gw-activity-day").forEach(btn => {
        btn.addEventListener("click", evt => {
          evt.preventDefault();
          if (btn.dataset.count === "0") return;
          selectedDay = btn.dataset.day;
          selectedHour = null;
          render();
        });
      });

      modal.querySelectorAll(".gw-activity-hour").forEach(btn => {
        btn.addEventListener("click", evt => {
          evt.preventDefault();
          selectedHour = Number(btn.dataset.hour);
          render();
        });
      });
    }

    modal.addEventListener("click", evt => {
      if (evt.target === modal) close();
    });

    modal.addEventListener("keydown", evt => {
      if (evt.key === "Escape") close();
    });

    render();
    document.body.appendChild(modal);
    modal.querySelector("#gwObservationActivityCloseBtn")?.focus();
  }

  window.GridWildObservationActivity = {
    open,
    summarize
  };
})();
