const tilesEl = document.getElementById("tiles");
const matrixEl = document.getElementById("matrix");
const matrixEmptyEl = document.getElementById("matrix-empty");
const timelineEl = document.getElementById("timeline");
const serviceFilter = document.getElementById("filter-service");
const environmentFilter = document.getElementById("filter-environment");

// Environments are shown in this order; anything else comes after, alphabetically
const ENVIRONMENT_ORDER = ["dev", "staging", "prod", "production"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " h ago";
  return Math.floor(seconds / 86400) + " d ago";
}

function sortEnvironments(names) {
  const rank = (name) => {
    const index = ENVIRONMENT_ORDER.indexOf(name);
    return index === -1 ? ENVIRONMENT_ORDER.length : index;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function renderTiles(summary) {
  const stats = summary.last7Days;
  const services = new Set(summary.latest.map((d) => d.service)).size;
  const tiles = [
    [services, "services"],
    [stats.total, "deployments, last 7 days"],
    [stats.successRate === null ? "–" : stats.successRate + "%", "success rate"],
    [stats.failed, "failed, last 7 days"],
  ];
  tilesEl.replaceChildren(...tiles.map(([value, label]) => {
    const tile = el("div", "tile");
    tile.append(el("div", "tile-value", String(value)), el("div", "tile-label", label));
    return tile;
  }));
}

function renderMatrix(latest) {
  matrixEmptyEl.hidden = latest.length > 0;
  matrixEl.replaceChildren();
  if (latest.length === 0) return;

  const environments = sortEnvironments(new Set(latest.map((d) => d.environment)));
  const services = [...new Set(latest.map((d) => d.service))].sort();

  const head = el("tr");
  head.append(el("th", "", "Service"), ...environments.map((name) => el("th", "", name)));
  matrixEl.append(head);

  for (const service of services) {
    const row = el("tr");
    row.append(el("td", "service", service));
    for (const environment of environments) {
      const found = latest.find((d) => d.service === service && d.environment === environment);
      const cell = el("td", found ? "" : "none");
      if (found) {
        const badge = el("span", "badge " + found.status, found.version);
        badge.title = found.status.replace("_", " ") + " · " + new Date(found.deployedAt).toLocaleString();
        cell.append(badge);
      } else {
        cell.textContent = "–";
      }
      row.append(cell);
    }
    matrixEl.append(row);
  }
}

function fillFilter(select, values) {
  const current = select.value;
  const first = select.options[0];
  select.replaceChildren(first, ...values.map((value) => {
    const option = el("option", "", value);
    option.value = value;
    return option;
  }));
  select.value = current;
}

function renderTimeline(deployments) {
  if (deployments.length === 0) {
    timelineEl.replaceChildren(el("li", "muted", "Nothing to show."));
    return;
  }
  timelineEl.replaceChildren(...deployments.map((d) => {
    const item = el("li");
    const what = el("div", "what");
    const line = el("div");
    line.append(el("b", "", d.service), " ", el("code", "", d.version), " → " + d.environment);
    const details = [d.status.replace("_", " "), d.author, d.commit && d.commit.slice(0, 7)].filter(Boolean);
    what.append(line, el("div", "meta", details.join(" · ")));
    const when = el("span", "when", timeAgo(d.deployedAt));
    when.title = new Date(d.deployedAt).toLocaleString();
    item.append(el("span", "pip " + d.status), what, when);
    return item;
  }));
}

async function loadTimeline() {
  const params = new URLSearchParams({ limit: "30" });
  if (serviceFilter.value) params.set("service", serviceFilter.value);
  if (environmentFilter.value) params.set("environment", environmentFilter.value);
  renderTimeline(await (await fetch("/api/deployments?" + params)).json());
}

async function refresh() {
  const summary = await (await fetch("/api/summary")).json();
  renderTiles(summary);
  renderMatrix(summary.latest);
  fillFilter(serviceFilter, [...new Set(summary.latest.map((d) => d.service))].sort());
  fillFilter(environmentFilter, sortEnvironments(new Set(summary.latest.map((d) => d.environment))));
  await loadTimeline();
}

serviceFilter.addEventListener("change", loadTimeline);
environmentFilter.addEventListener("change", loadTimeline);

refresh();
setInterval(refresh, 15000);
