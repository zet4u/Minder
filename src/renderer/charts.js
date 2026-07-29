/* ============================================================
   Charts — hand-rolled SVG, no dependencies.
   Every function takes real data and returns markup.
   ============================================================ */
(function () {
  "use strict"

  function niceMax(v, step) {
    const s = step || 1
    return Math.max(s, Math.ceil(v / s) * s)
  }

  /* ---- weekly bars: days = [{label, hours, isToday}] ---- */
  function weekly(days, goalHours, fmt) {
    const W = 620, H = 250, p = { t: 26, b: 30, l: 40, r: 10 }
    const maxData = Math.max(goalHours || 0, ...days.map((d) => d.hours), 1)
    const max = niceMax(maxData * 1.12, 2)
    const iw = W - p.l - p.r, ih = H - p.t - p.b
    const slot = iw / days.length, bw = Math.min(46, slot * 0.5)
    let s = ""
    for (let g = 0; g <= 3; g++) {
      const y = p.t + (ih * g) / 3
      s += `<line x1="${p.r}" x2="${W - p.l}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.07)"/>`
      s += `<text class="axis" x="${W - p.l + 10}" y="${y + 4}">${fmt(Math.round(max - (max * g) / 3))}</text>`
    }
    if (goalHours > 0 && goalHours < max) {
      const gy = p.t + ih * (1 - goalHours / max)
      s += `<line x1="${p.r}" x2="${W - p.l}" y1="${gy}" y2="${gy}" stroke="rgba(222,146,85,.55)" stroke-dasharray="5 5"/>`
    }
    days.forEach((d, i) => {
      const cx = W - p.l - slot * i - slot / 2
      const h = Math.max(d.hours > 0 ? 3 : 0, (ih * d.hours) / max)
      const y = p.t + ih - h
      const fill = d.isToday ? "#5E9FE8" : d.hours > 0 ? "rgba(94,159,232,.34)" : "rgba(255,255,255,.07)"
      s += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="5" fill="${fill}"/>`
      if (d.isToday && d.hours > 0)
        s += `<text class="axis" x="${cx}" y="${y - 8}" text-anchor="middle" fill="#fff">${d.valueText}</text>`
      s += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${d.label}</text>`
    })
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار هفته‌ی جاری">${s}</svg>`
  }

  /* ---- donut: parts = [{ms, color}] ---- */
  function donut(parts, centerTop, centerSub) {
    const total = parts.reduce((a, b) => a + b.ms, 0)
    const R = 84, sw = 22, C = 2 * Math.PI * R
    let acc = 0, ring = ""
    if (total > 0) {
      parts.forEach((p) => {
        const frac = p.ms / total
        ring += `<circle cx="110" cy="110" r="${R}" fill="none" stroke="${p.color}" stroke-width="${sw}"
          stroke-dasharray="${(C * frac).toFixed(2)} ${(C * (1 - frac)).toFixed(2)}"
          stroke-dashoffset="${(-C * acc).toFixed(2)}" stroke-linecap="butt"
          transform="rotate(-90 110 110)"/>`
        acc += frac
      })
    } else {
      ring = `<circle cx="110" cy="110" r="${R}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${sw}"/>`
    }
    return `<svg viewBox="0 0 220 220" style="max-width:220px;margin-inline:auto" role="img" aria-label="سهم دسته‌ها">
      ${ring}
      <text x="110" y="106" text-anchor="middle" fill="#fff" style="font-size:30px;font-weight:700">${centerTop}</text>
      <text x="110" y="132" text-anchor="middle" fill="rgba(255,255,255,.44)" style="font-size:13px">${centerSub}</text>
    </svg>`
  }

  /* ---- monthly line: months = [{label, hours}] ---- */
  function monthly(months, fmt) {
    const W = 900, H = 210, p = { t: 18, b: 30, r: 34, l: 52 }
    const max = niceMax(Math.max(1, ...months.map((m) => m.hours)) * 1.15, 20)
    const iw = W - p.l - p.r, ih = H - p.t - p.b
    const step = months.length > 1 ? iw / (months.length - 1) : 0
    let s = ""
    for (let g = 0; g <= 3; g++) {
      const y = p.t + (ih * g) / 3
      s += `<line x1="${p.r}" x2="${W - p.l}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.07)"/>`
      s += `<text class="axis" x="${W - p.l + 12}" y="${y + 4}">${fmt(Math.round(max - (max * g) / 3))}</text>`
    }
    const pts = months.map((m, i) => [W - p.l - i * step, p.t + ih * (1 - m.hours / max)])
    const line = pts.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L")
    s += `<path d="M${line} L${pts[pts.length - 1][0]} ${p.t + ih} L${pts[0][0]} ${p.t + ih} Z" fill="rgba(94,159,232,.10)"/>`
    s += `<path d="M${line}" fill="none" stroke="#5E9FE8" stroke-width="2.5" stroke-linejoin="round"/>`
    pts.forEach((q, i) => {
      const last = i === months.length - 1
      s += `<circle cx="${q[0]}" cy="${q[1]}" r="${last ? 5 : 3}" fill="${last ? "#EAC26B" : "#5E9FE8"}"/>`
      s += `<text class="axis" x="${q[0]}" y="${H - 8}" text-anchor="middle">${months[i].label}</text>`
    })
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="روند ماهانه">${s}</svg>`
  }

  /* ---- heatmap: cells = [{level 0..4, title}] column-major, 7 rows ---- */
  function heat(cells) {
    const shades = [
      "rgba(255,255,255,.05)",
      "rgba(94,159,232,.28)",
      "rgba(94,159,232,.50)",
      "rgba(94,159,232,.72)",
      "#5E9FE8"
    ]
    return (
      `<div class="heat">` +
      cells.map((c) => `<i style="background:${shades[c.level]}" title="${c.title}"></i>`).join("") +
      `</div>` +
      `<div class="legend"><span>کمتر</span>` +
      shades.map((s) => `<i style="background:${s}"></i>`).join("") +
      `<span>بیشتر</span></div>`
    )
  }

  window.Charts = { weekly, donut, monthly, heat }
})()
