/* Astronautics Atlas: renders data/dataset.json */
(() => {
  "use strict";

  const WORLD_GEOJSON = "https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json";
  // OpenAlex country names -> names used in the ECharts world map
  const MAP_NAMES = {
    "South Korea": "Korea", "North Korea": "Dem. Rep. Korea", "Czechia": "Czech Rep.",
    "Bosnia & Herzegovina": "Bosnia and Herz.", "North Macedonia": "Macedonia", "DR Congo": "Dem. Rep. Congo",
    "Eswatini": "Swaziland", "Trinidad & Tobago": "Trinidad and Tobago", "Antigua and Barbuda": "Antigua and Barb.",
    "Ivory Coast": "Côte d'Ivoire", "Cabo Verde": "Cape Verde", "Faroe Islands": "Faeroe Is.",
    "French Polynesia": "Fr. Polynesia", "South Sudan": "S. Sudan", "Laos": "Lao PDR",
    "Central African Republic": "Central African Rep.", "Dominican Republic": "Dominican Rep.",
    "Equatorial Guinea": "Eq. Guinea", "Western Sahara": "W. Sahara",
  };
  // Map regions shown under their official names (applied via the series nameMap)
  const GEO_RENAME = { "Turkey": "Türkiye" };
  const TYPE_LABEL = { article: "Article", review: "Review", book: "Book", "book-chapter": "Chapter" };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = n => (n ?? 0).toLocaleString("en-US");
  const compact = n => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let DATA, TOPICS, PAPERS = new Map();
  const charts = [];

  const axisStyle = {
    axisLine: { lineStyle: { color: "rgba(143,155,196,.25)" } },
    axisLabel: { color: "#8f9bc4" },
    splitLine: { lineStyle: { color: "rgba(143,155,196,.08)" } },
  };
  const tooltipStyle = {
    backgroundColor: "rgba(10,15,31,.95)", borderColor: "rgba(130,160,255,.25)",
    textStyle: { color: "#e8ecff", fontFamily: "Inter" }, extraCssText: "border-radius:12px;max-width:340px;white-space:normal;",
  };

  function makeChart(id, option) {
    const el = document.getElementById(id);
    const c = echarts.init(el, null, { renderer: "canvas" });
    c.setOption({ textStyle: { fontFamily: "Inter" }, tooltip: tooltipStyle, ...option });
    charts.push(c);
    return c;
  }
  window.addEventListener("resize", () => charts.forEach(c => c.resize()));

  /* ---------------- starfield ---------------- */
  function starfield() {
    const cv = $("#stars"), ctx = cv.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars = [];
    const resize = () => {
      cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
      stars = Array.from({ length: Math.min(260, innerWidth / 5) }, () => ({
        x: Math.random() * cv.width, y: Math.random() * cv.height,
        r: Math.random() * 1.3 * devicePixelRatio + .2, p: Math.random() * Math.PI * 2, s: .3 + Math.random(),
      }));
    };
    const draw = t => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        ctx.globalAlpha = .35 + .45 * Math.sin(s.p + t / 1000 * s.s) ** 2;
        ctx.fillStyle = "#cfd8ff";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      }
      if (!reduce) requestAnimationFrame(draw);
    };
    resize(); addEventListener("resize", resize); requestAnimationFrame(draw);
  }

  /* ---------------- helpers ---------------- */
  const topicOf = p => TOPICS[p.topic] || { label: "Other", color: "#8f9bc4" };
  const authorsLine = p => {
    if (!p.authors.length) return "Unknown authors";
    const extra = p.authorCount > 3 ? ` +${p.authorCount - 3}` : "";
    return p.authors.slice(0, 3).join(", ") + extra;
  };

  function sparkline(p, w = 120, h = 26) {
    const now = new Date().getFullYear();
    const ys = []; for (let y = now - 9; y <= now; y++) ys.push(p.byYear[y] || 0);
    const max = Math.max(1, ...ys);
    const pts = ys.map((v, i) => `${(i / (ys.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
    const col = topicOf(p).color;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${col}" stroke-width="1.6" points="${pts}"/></svg>`;
  }

  function tagsHtml(p) {
    const t = topicOf(p);
    return `<div class="tags">
      <span class="tag topic" style="background:${t.color}">${esc(t.label)}</span>
      <span class="tag">${p.year ?? "n/a"}</span>
      ${p.type && TYPE_LABEL[p.type] ? `<span class="tag">${TYPE_LABEL[p.type]}</span>` : ""}
      ${p.venue ? `<span class="tag">${esc(p.venue.length > 42 ? p.venue.slice(0, 40) + "…" : p.venue)}</span>` : ""}
      ${p.oa && p.oa !== "closed" ? `<span class="tag oa">Open access</span>` : ""}
    </div>`;
  }

  /* ---------------- hero ---------------- */
  function hero() {
    const d = new Date(DATA.generatedAt);
    const s = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    $("#updated").textContent = s;
    $("#footUpdated").textContent = `Last refreshed ${s}.`;
    const values = { ...DATA.totals, topCites: DATA.hallOfFame[0]?.citations };
    $$("[data-count]").forEach(el => {
      const target = values[el.dataset.count] || 0, t0 = performance.now(), dur = 1600;
      const step = t => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
        el.textContent = fmt(Math.round(target * e));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------------- hall of fame ---------------- */
  const hall = { topic: "all", era: "all", sort: "citations", q: "", shown: 25 };

  function podium() {
    $("#podium").innerHTML = DATA.hallOfFame.slice(0, 3).map((p, i) => `
      <article class="pcard" data-id="${p.id}">
        <div class="rank">#${i + 1}</div>
        <div class="ptitle">${esc(p.title)}</div>
        <div class="meta">${esc(authorsLine(p))} · ${p.year}</div>
        ${tagsHtml(p)}
        <div class="big">${fmt(p.citations)} <small>citations</small></div>
      </article>`).join("");
  }

  function hallChips() {
    const chips = [`<button class="chip on" data-t="all">All fields</button>`].concat(
      Object.entries(TOPICS).map(([k, t]) => `<button class="chip" data-t="${k}"><i style="background:${t.color}"></i>${esc(t.label)}</button>`));
    $("#topicChips").innerHTML = chips.join("");
    $("#topicChips").addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      $$("#topicChips .chip").forEach(c => c.classList.toggle("on", c === b));
      hall.topic = b.dataset.t; hall.shown = 25; renderHall();
    });
  }

  function hallFiltered() {
    const q = hall.q.trim().toLowerCase();
    const [lo, hi] = hall.era === "all" ? [0, 9999] : hall.era.split("-").map(Number);
    // Pool: global hall of fame + each field's own top list, so field filters stay full.
    const pool = new Map(DATA.hallOfFame.map(p => [p.id, p]));
    Object.values(DATA.topics).forEach(t => t.top.forEach(p => pool.has(p.id) || pool.set(p.id, p)));
    return [...pool.values()]
      .filter(p => hall.topic === "all" || p.topic === hall.topic)
      .filter(p => (p.year ?? 0) >= lo && (p.year ?? 0) <= hi)
      .filter(p => !q || [p.title, p.venue, ...p.authors].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b[hall.sort] ?? -1) - (a[hall.sort] ?? -1));
  }

  function renderHall() {
    const list = hallFiltered();
    const sortLabel = { citations: "citations", recent: "cites, last 2 yrs", velocity: "cites / year", influential: "influential" }[hall.sort];
    $("#hallList").innerHTML = list.length ? list.slice(0, hall.shown).map((p, i) => `
      <li class="paper" data-id="${p.id}">
        <div class="r">${i + 1}</div>
        <div><div class="t">${esc(p.title)}</div><div class="a">${esc(authorsLine(p))}</div>${tagsHtml(p)}</div>
        <div class="c"><b>${fmt(p[hall.sort] ?? 0)}</b><span>${sortLabel}</span>${sparkline(p)}</div>
      </li>`).join("") : `<li class="empty">No papers match these filters.</li>`;
    $("#hallMore").style.display = list.length > hall.shown ? "block" : "none";
  }

  function hallControls() {
    let timer;
    $("#search").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { hall.q = e.target.value; hall.shown = 25; renderHall(); }, 120); });
    $("#era").addEventListener("change", e => { hall.era = e.target.value; hall.shown = 25; renderHall(); });
    $("#sort").addEventListener("change", e => { hall.sort = e.target.value; renderHall(); });
    $("#hallMore").addEventListener("click", () => { hall.shown += 25; renderHall(); });
  }

  /* ---------------- rising ---------------- */
  function rising() {
    const top = DATA.rising.slice(0, 15).reverse();
    const year = new Date().getFullYear();
    makeChart("risingChart", {
      grid: { left: 10, right: 50, top: 10, bottom: 34, containLabel: true },
      tooltip: { ...tooltipStyle, trigger: "item", formatter: pr => {
        const p = top[pr.dataIndex];
        return `<b>${esc(p.title)}</b><br>${esc(authorsLine(p))} · ${p.year}<br>${fmt(p.byYear[year - 1] || 0)} cites in ${year - 1}, ${fmt(p.byYear[year] || 0)} in ${year}<br>Total: ${fmt(p.citations)}`;
      } },
      xAxis: { type: "value", ...axisStyle, name: `citations ${year - 1}–${year}`, nameLocation: "middle", nameGap: 30, nameTextStyle: { color: "#5d6894" } },
      yAxis: { type: "category", ...axisStyle, data: top.map(p => p.title.length > 44 ? p.title.slice(0, 42) + "…" : p.title), axisLabel: { color: "#c4cbe8", fontSize: 11, width: 260, overflow: "truncate" } },
      series: [{
        type: "bar", barWidth: "62%",
        data: top.map(p => ({ value: p.recent, itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: topicOf(p).color + "55" }, { offset: 1, color: topicOf(p).color }]), borderRadius: [0, 6, 6, 0] } })),
        label: { show: true, position: "right", color: "#e8ecff", fontFamily: "Space Grotesk" },
      }],
    }).on("click", pr => openPaper(top[pr.dataIndex].id));

    $("#freshList").innerHTML = DATA.fresh.slice(0, 12).map(p => `
      <li data-id="${p.id}"><div class="mt">${esc(p.title)}<small>${esc(authorsLine(p))} · ${p.year} · ${esc(topicOf(p).label)}</small></div><div class="mc">${fmt(p.citations)}</div></li>`).join("");
  }

  /* ---------------- galaxy ---------------- */
  function galaxy() {
    const pool = new Map();
    [...DATA.hallOfFame, ...DATA.rising, ...DATA.fresh, ...Object.values(DATA.topics).flatMap(t => t.top)].forEach(p => pool.set(p.id, p));
    const all = [...pool.values()].filter(p => p.year && p.year >= 1940);
    const maxV = Math.max(...all.map(p => p.velocity));
    const series = Object.entries(TOPICS).map(([k, t]) => ({
      name: t.label, type: "scatter",
      data: all.filter(p => p.topic === k).map(p => ({ value: [p.year, Math.max(1, p.citations), p.velocity], id: p.id, title: p.title })),
      symbolSize: v => 6 + Math.sqrt(v[2] / maxV) * 34,
      itemStyle: { color: new echarts.graphic.RadialGradient(.5, .5, .5, [{ offset: 0, color: "#fff" }, { offset: .35, color: t.color }, { offset: 1, color: t.color + "11" }]), shadowBlur: 14, shadowColor: t.color },
      emphasis: { scale: 1.4 },
    }));
    makeChart("galaxyChart", {
      legend: { type: "scroll", top: 0, left: "center", width: "92%", itemGap: 22, textStyle: { color: "#8f9bc4" }, itemWidth: 10, itemHeight: 10, icon: "circle", pageTextStyle: { color: "#8f9bc4" } },
      grid: { left: 20, right: 30, top: 60, bottom: 40, containLabel: true },
      tooltip: { ...tooltipStyle, formatter: pr => `<b>${esc(pr.data.title)}</b><br>${pr.value[0]} · ${fmt(pr.value[1])} citations · ${pr.value[2]}/yr` },
      xAxis: { type: "value", min: v => Math.floor(v.min / 10) * 10, max: new Date().getFullYear() + 1, ...axisStyle, splitLine: { show: false }, axisLabel: { color: "#8f9bc4", formatter: v => v } },
      yAxis: { type: "log", ...axisStyle, name: "citations", nameTextStyle: { color: "#5d6894" } },
      dataZoom: [{ type: "inside" }],
      series,
    }).on("click", pr => pr.data?.id && openPaper(pr.data.id));
  }

  /* ---------------- landscape ---------------- */
  function landscape() {
    const year = new Date().getFullYear();
    const years = []; for (let y = 1957; y < year; y++) years.push(y);
    makeChart("yearChart", {
      legend: { show: false },
      tooltip: { ...tooltipStyle, trigger: "axis", order: "valueDesc" },
      grid: { left: 10, right: 20, top: 20, bottom: 30, containLabel: true },
      xAxis: { type: "category", data: years, boundaryGap: false, ...axisStyle },
      yAxis: { type: "value", ...axisStyle },
      dataZoom: [{ type: "inside" }],
      series: Object.values(TOPICS).map(t => ({
        name: t.label, type: "line", stack: "all", smooth: true, symbol: "none",
        lineStyle: { width: 0 }, areaStyle: { color: t.color, opacity: .85 }, color: t.color,
        data: years.map(y => t.byYear[y] || 0),
      })),
    });

    makeChart("shareChart", {
      tooltip: { ...tooltipStyle, formatter: p => `${esc(p.name)}<br><b>${fmt(p.value)}</b> works (${p.percent}%)` },
      legend: { bottom: 0, left: "center", itemGap: 10, itemWidth: 9, itemHeight: 9, icon: "circle", textStyle: { color: "#8f9bc4", fontSize: 11 } },
      series: [{
        type: "pie", radius: ["42%", "68%"], center: ["50%", "40%"], padAngle: 2,
        itemStyle: { borderRadius: 8 },
        label: { color: "#e8ecff", formatter: "{d}%", fontSize: 11 },
        data: Object.values(TOPICS).map(t => ({ name: t.label, value: t.works, itemStyle: { color: t.color } })).sort((a, b) => b.value - a.value),
      }],
    });

    const keys = Object.keys(TOPICS);
    $("#topicTabs").innerHTML = keys.map((k, i) => `<button class="chip ${i ? "" : "on"}" data-t="${k}"><i style="background:${TOPICS[k].color}"></i>${esc(TOPICS[k].label)}</button>`).join("");
    const show = k => {
      $$("#topicTabs .chip").forEach(c => c.classList.toggle("on", c.dataset.t === k));
      $("#topicList").innerHTML = DATA.topics[k].top.map(p =>
        `<li data-id="${p.id}"><div class="mt">${esc(p.title)}<small>${esc(authorsLine(p))} · ${p.year}</small></div><div class="mc">${fmt(p.citations)}</div></li>`).join("");
    };
    $("#topicTabs").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) show(b.dataset.t); });
    show(keys[0]);
  }

  /* ---------------- world ---------------- */
  async function world() {
    const bar = makeChart("countryBar", {});
    const map = makeChart("worldChart", {});
    let geoOk = false;
    try {
      const geo = await (await fetch(WORLD_GEOJSON)).json();
      echarts.registerMap("world", geo); geoOk = true;
    } catch (e) { $("#worldChart").innerHTML = `<p class="empty">World map unavailable offline.</p>`; }

    const render = mode => {
      const src = mode === "recent" ? DATA.recentCountries : DATA.countries;
      const top = src.slice(0, 15).reverse();
      bar.setOption({
        grid: { left: 10, right: 50, top: 10, bottom: 10, containLabel: true },
        tooltip: { ...tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
        xAxis: { type: "value", ...axisStyle, axisLabel: { color: "#8f9bc4", formatter: compact } },
        yAxis: { type: "category", data: top.map(c => c.name), ...axisStyle, axisLabel: { color: "#c4cbe8" } },
        series: [{ type: "bar", data: top.map(c => c.count), barWidth: "60%", label: { show: true, position: "right", color: "#e8ecff", formatter: p => compact(p.value) },
          itemStyle: { borderRadius: [0, 6, 6, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: "#2b3c8f" }, { offset: 1, color: "#33d1c6" }]) } }],
      }, true);
      if (!geoOk) return;
      // Log scale: the US would otherwise wash every other country out to the same shade.
      const max = src[0]?.count || 1;
      map.setOption({
        tooltip: { ...tooltipStyle, formatter: p => `${esc(p.name)}<br><b>${fmt(p.data?.raw || 0)}</b> works` },
        visualMap: { min: 0, max: Math.log10(max), type: "continuous", calculable: false, orient: "horizontal", left: 10, bottom: 10, itemWidth: 10, itemHeight: 160,
          text: [compact(max), "1"], textGap: 8, inRange: { color: ["#141c42", "#1d3a8f", "#2f6fdf", "#33d1c6", "#d4fff8"] }, textStyle: { color: "#8f9bc4" } },
        series: [{ type: "map", map: "world", roam: true, scaleLimit: { min: 1, max: 6 }, emphasis: { label: { show: false }, itemStyle: { areaColor: "#ff7a45" } },
          itemStyle: { areaColor: "#0c1128", borderColor: "rgba(130,160,255,.18)" },
          nameMap: GEO_RENAME, data: src.map(c => ({ name: MAP_NAMES[c.name] || c.name, value: Math.log10(c.count), raw: c.count })) }],
      }, true);
    };
    $("#worldSeg").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      $$("#worldSeg button").forEach(x => x.classList.toggle("on", x === b));
      render(b.dataset.v);
    });
    render("all");
    if (DATA.countryCoverage != null) {
      $("#coverageNote").textContent = `Country is known for ${Math.round(DATA.countryCoverage * 100)}% of works (those with at least one recorded author affiliation), so counts are lower bounds. Rankings are what matter here.`;
    }
  }

  /* ---------------- country growth ---------------- */
  function countryGrowth() {
    const cy = DATA.countryYears;
    if (!cy) return;
    const ys = cy.years, n = ys.length;
    const early = `${ys[0]}–${String(ys[2]).slice(2)}`, late = `${ys[n - 3]}–${String(ys[n - 1]).slice(2)}`;
    $("#growthSub").textContent = `${late} vs ${early}`;
    const sum = a => a.reduce((x, y) => x + y, 0);
    const growth = Object.entries(cy.series).map(([k, c]) => {
      const e = sum(c.counts.slice(0, 3)), l = sum(c.counts.slice(-3));
      return { key: k, name: c.name, e, l, ratio: e ? l / e : 0 };
    }).filter(g => g.e >= 25 && g.l >= 100).sort((a, b) => b.ratio - a.ratio);
    const top = growth.slice(0, 15).reverse();

    const COLORS = ["#33d1c6", "#ffd166", "#ff7a45", "#c77dff", "#5b8cff", "#ff5d8f", "#8ce99a", "#7fdbff", "#e49a6c", "#a5d8ff"];
    const shown = growth.slice(0, 5).map(g => g.key);
    const traj = makeChart("trajChart", {});
    // Index each country to its own 2016–18 average so small and large producers share one scale.
    const indexed = k => { const c = cy.series[k].counts, base = sum(c.slice(0, 3)) / 3 || 1; return c.map(v => +(v / base).toFixed(2)); };
    const drawTraj = () => {
      traj.setOption({
        tooltip: { ...tooltipStyle, trigger: "axis", order: "valueDesc", formatter: ps => `<b>${ps[0].axisValue}</b><br>` + ps.map(p =>
          `${p.marker}${esc(p.seriesName)}: <b>${p.value}×</b> <span style="color:#8f9bc4">(${fmt(cy.series[shown[p.seriesIndex]].counts[p.dataIndex])} works)</span>`).join("<br>") },
        legend: { top: 0, textStyle: { color: "#8f9bc4" }, icon: "circle", itemWidth: 9, itemHeight: 9 },
        grid: { left: 10, right: 30, top: 40, bottom: 10, containLabel: true },
        xAxis: { type: "category", data: ys, boundaryGap: false, ...axisStyle },
        yAxis: { type: "value", ...axisStyle, axisLabel: { color: "#8f9bc4", formatter: v => v + "×" } },
        series: shown.map((k, i) => ({
          name: cy.series[k].name, type: "line", smooth: true, symbolSize: 6,
          data: indexed(k), color: COLORS[i % COLORS.length], lineStyle: { width: 2.5 },
          markLine: i ? undefined : { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "rgba(143,155,196,.35)", type: "dashed" }, data: [{ yAxis: 1 }] },
        })),
      }, true);
    };
    const toggle = k => {
      const i = shown.indexOf(k);
      if (i >= 0) shown.splice(i, 1); else shown.push(k);
      drawTraj();
    };

    makeChart("growthChart", {
      grid: { left: 10, right: 50, top: 10, bottom: 10, containLabel: true },
      tooltip: { ...tooltipStyle, formatter: p => { const g = top[p.dataIndex];
        return `<b>${esc(g.name)}</b><br>${early}: ${fmt(g.e)} works<br>${late}: ${fmt(g.l)} works<br><b>${g.ratio.toFixed(1)}×</b> growth<br><span style="color:#8f9bc4">Click to compare</span>`; } },
      xAxis: { type: "value", ...axisStyle, axisLabel: { color: "#8f9bc4", formatter: v => v + "×" } },
      yAxis: { type: "category", data: top.map(g => g.name), ...axisStyle, axisLabel: { color: "#c4cbe8" } },
      series: [{ type: "bar", barWidth: "60%", data: top.map(g => +g.ratio.toFixed(2)),
        label: { show: true, position: "right", color: "#e8ecff", formatter: p => p.value.toFixed(1) + "×" },
        itemStyle: { borderRadius: [0, 6, 6, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: "#1d3a8f" }, { offset: 1, color: "#8ce99a" }]) } }],
    }).on("click", p => toggle(top[p.dataIndex].key));

    const pick = $("#trajPick");
    Object.entries(cy.series).sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([k, c]) => pick.insertAdjacentHTML("beforeend", `<option value="${k}">${esc(c.name)}</option>`));
    pick.addEventListener("change", () => { if (pick.value) toggle(pick.value); pick.value = ""; });
    drawTraj();
  }

  /* ---------------- venues ---------------- */
  function venues() {
    const hbar = (id, items, colors) => {
      const top = items.slice(0, 15).reverse();
      makeChart(id, {
        grid: { left: 24, right: 50, top: 10, bottom: 10, containLabel: true },
        tooltip: { ...tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
        xAxis: { type: "value", ...axisStyle, axisLabel: { color: "#8f9bc4", formatter: compact } },
        yAxis: { type: "category", data: top.map(s => s.name), ...axisStyle, axisLabel: { color: "#c4cbe8", width: 190, overflow: "truncate", fontSize: 11 } },
        series: [{ type: "bar", data: top.map(s => s.count), barWidth: "60%", label: { show: true, position: "right", color: "#e8ecff", formatter: p => compact(p.value) },
          itemStyle: { borderRadius: [0, 6, 6, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, colors) } }],
      });
    };
    hbar("sourceChart", DATA.sources, [{ offset: 0, color: "#3a1f6b" }, { offset: 1, color: "#c77dff" }]);
    hbar("instChart", DATA.institutions, [{ offset: 0, color: "#5a2a14" }, { offset: 1, color: "#ff7a45" }]);

    const OA_COLORS = { gold: "#ffd166", green: "#3ee28a", hybrid: "#33d1c6", bronze: "#e49a6c", diamond: "#a5d8ff", closed: "#3a4470" };
    makeChart("oaChart", {
      tooltip: { ...tooltipStyle, formatter: p => `${esc(p.name)}<br><b>${fmt(p.value)}</b> works (${p.percent}%)` },
      series: [{ type: "pie", radius: ["50%", "78%"], padAngle: 2, itemStyle: { borderRadius: 8 },
        label: { color: "#c4cbe8", formatter: "{b}\n{d}%" },
        data: DATA.openAccess.filter(o => o.key !== "unknown").map(o => ({ name: o.name[0].toUpperCase() + o.name.slice(1), value: o.count, itemStyle: { color: OA_COLORS[o.key] || "#8f9bc4" } })) }],
    });
  }

  /* ---------------- paper modal ---------------- */
  let modalChart;
  function openPaper(id) {
    const p = PAPERS.get(id); if (!p) return;
    const t = topicOf(p);
    const years = Object.keys(p.byYear);
    $("#modalBody").innerHTML = `
      <h3>${esc(p.title)}</h3>
      <div class="meta" style="color:var(--muted)">${esc(p.authors.join(", "))}${p.authorCount > p.authors.length ? ` and ${p.authorCount - p.authors.length} more` : ""}</div>
      ${p.institutions.length ? `<div class="muted" style="margin-top:4px">${esc(p.institutions.join(" · "))}</div>` : ""}
      ${tagsHtml(p)}
      <div class="m-stats">
        <div><b>${fmt(p.citations)}</b><span>citations</span></div>
        <div><b>${fmt(p.recent)}</b><span>last 2 years</span></div>
        <div><b>${p.influential != null ? fmt(p.influential) : "n/a"}</b><span>influential</span></div>
        <div><b>${p.fwci ?? "n/a"}</b><span>FWCI</span></div>
      </div>
      ${years.length ? `<div id="modalChart"></div>` : `<p class="muted">No yearly citation breakdown available (OpenAlex tracks the last ~10 years).</p>`}
      <div class="m-links">
        ${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">DOI ↗</a>` : ""}
        ${p.oaUrl ? `<a href="${esc(p.oaUrl)}" target="_blank" rel="noopener">Free full text ↗</a>` : ""}
        ${p.s2Url ? `<a href="${esc(p.s2Url)}" target="_blank" rel="noopener">Semantic Scholar ↗</a>` : ""}
        <a href="https://openalex.org/${p.id}" target="_blank" rel="noopener">OpenAlex ↗</a>
        <a href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}" target="_blank" rel="noopener">Google Scholar ↗</a>
      </div>`;
    const dlg = $("#paperModal");
    dlg.showModal();
    if (years.length) {
      modalChart?.dispose();
      modalChart = echarts.init($("#modalChart"));
      modalChart.setOption({
        textStyle: { fontFamily: "Inter" }, tooltip: { ...tooltipStyle, trigger: "axis" },
        grid: { left: 10, right: 10, top: 20, bottom: 10, containLabel: true },
        xAxis: { type: "category", data: years, ...axisStyle },
        yAxis: { type: "value", ...axisStyle },
        series: [{ type: "bar", name: "Citations", data: Object.values(p.byYear), itemStyle: { color: t.color, borderRadius: [5, 5, 0, 0] } }],
      });
    }
  }

  function wireModal() {
    const dlg = $("#paperModal");
    $(".close", dlg).addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.addEventListener("click", e => {
      const el = e.target.closest("[data-id]");
      if (el && !dlg.contains(el)) openPaper(el.dataset.id);
    });
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    starfield();
    try {
      DATA = await (await fetch("data/dataset.json", { cache: "no-cache" })).json();
    } catch (e) {
      document.querySelector("main").innerHTML = `<p class="empty">Couldn't load the dataset. Try refreshing.</p>`;
      return;
    }
    TOPICS = DATA.topics;
    [...DATA.hallOfFame, ...DATA.rising, ...DATA.fresh, ...Object.values(DATA.topics).flatMap(t => t.top)].forEach(p => PAPERS.set(p.id, p));
    hero(); podium(); hallChips(); hallControls(); renderHall();
    rising(); galaxy(); landscape(); venues(); wireModal();
    countryGrowth(); world();
  }
  boot();
})();
