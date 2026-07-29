/* ============================================================
   Daily card renderer — shared by the in-app live preview and the
   offscreen full-resolution PNG export.
   Sizes use cqw so one markup works at 1200px or 1080px wide.
   ============================================================ */
(function () {
  "use strict"

  const ASPECTS = {
    "16:10": { w: 1200, h: 750, label: "۱۶:۱۰" },
    "1:1": { w: 1080, h: 1080, label: "۱:۱" },
    "9:16": { w: 1080, h: 1920, label: "استوری" }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]))
  }

  function cardCss(bg) {
    const dark = bg !== "gray"
    return `
  .shot{
    container-type:inline-size;
    position:relative; overflow:hidden; border-radius:2.2cqw;
    background:${dark ? "#0A0A0A" : "#1E1E1E"};
    color:#fff; padding:4.4cqw 5cqw;
    display:flex; flex-direction:column;
    font-family:"Modam","Segoe UI",system-ui,sans-serif;
    line-height:1.6; word-spacing:.06em;
  }
  .shot .glow{position:absolute; inset-inline-end:-14cqw; top:-16cqw; width:44cqw; height:44cqw;
    border-radius:50%; background:radial-gradient(circle, rgba(255,255,255,.055), transparent 70%)}
  .shot .head{display:flex; align-items:flex-start; gap:3cqw; position:relative}
  .shot .who{flex:1; min-width:0}
  .shot .name{font-size:3.1cqw; font-weight:700; letter-spacing:-.01em}
  .shot .date{font-size:2.4cqw; color:rgba(255,255,255,.5); margin-top:.2cqw}
  .shot .ring{flex:0 0 auto; width:13cqw; height:13cqw; border-radius:50%; padding:.7cqw;
    background:conic-gradient(from 210deg, rgba(255,255,255,.55), rgba(255,255,255,.06) 70%, rgba(255,255,255,.55));
    display:grid; place-items:center}
  .shot .ring .in{width:100%; height:100%; border-radius:50%; overflow:hidden;
    background:#161616; display:grid; place-items:center}
  .shot .ring img{width:100%; height:100%; object-fit:cover; filter:grayscale(1) contrast(1.08)}
  .shot .ring span{font-size:4.6cqw; color:rgba(255,255,255,.35)}

  .shot .total{margin-top:2.6cqw; display:flex; align-items:flex-end; gap:2.4cqw}
  .shot .big{font-size:12cqw; font-weight:900; line-height:.92; letter-spacing:-.02em;
    font-variant-numeric:tabular-nums; direction:ltr; unicode-bidi:isolate}
  .shot .cap{padding-bottom:1.6cqw}
  .shot .cap .t{font-size:3cqw; font-weight:700}
  .shot .cap .g{font-size:2.3cqw; color:rgba(255,255,255,.45)}

  .shot .goal{margin-top:2.2cqw}
  .shot .goal .track{height:1cqw; border-radius:99px; background:rgba(255,255,255,.12); overflow:hidden}
  .shot .goal .track i{display:block; height:100%; border-radius:99px; background:#fff; opacity:.92}
  .shot .goal .meta{display:flex; justify-content:space-between; font-size:2.1cqw;
    color:rgba(255,255,255,.45); margin-top:1cqw}

  .shot .rows{margin-top:2cqw; flex:1; display:flex; flex-direction:column; justify-content:center}
  .shot .row{display:grid; grid-template-columns:1fr 32cqw auto; align-items:center;
    gap:2.4cqw; padding:1.15cqw 0; border-top:1px solid rgba(255,255,255,.08)}
  .shot .row:first-child{border-top:0}
  .shot .rn{display:flex; align-items:center; gap:1.6cqw; font-size:2.9cqw; min-width:0}
  .shot .rn em{font-style:normal; font-size:3.1cqw}
  .shot .rn b{font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .shot .rbar{height:.75cqw; border-radius:99px; background:rgba(255,255,255,.10); overflow:hidden}
  .shot .rbar i{display:block; height:100%; border-radius:99px; background:rgba(255,255,255,.85)}
  .shot .rv{font-size:2.5cqw; color:rgba(255,255,255,.62); white-space:nowrap;
    font-variant-numeric:tabular-nums}
  .shot .rv u{text-decoration:none; color:rgba(255,255,255,.32); margin-inline-start:1.2cqw}

  .shot .foot{margin-top:2cqw; padding-top:1.8cqw; border-top:1px solid rgba(255,255,255,.10);
    display:flex; align-items:center; justify-content:space-between; font-size:2.3cqw;
    color:rgba(255,255,255,.45)}
  .shot .foot b{color:rgba(255,255,255,.8); font-weight:700}
  .shot .brand{display:flex; align-items:center; gap:1.2cqw; letter-spacing:.14em;
    text-transform:uppercase; font-size:2cqw; color:rgba(255,255,255,.35); direction:ltr}
  .shot .brand i{width:1.5cqw; height:1.5cqw; border-radius:50%; background:rgba(255,255,255,.4)}
  .shot.empty-state .rows{display:grid; place-items:center; color:rgba(255,255,255,.35); font-size:2.7cqw}
`
  }

  /* data: {name, dateText, totalText, title, goalText, goalPct, rows:[{emoji,name,valueText,pct}],
           streakText, monthText, avatar, showAvatar, bg, aspect} */
  function markup(d) {
    const rows = (d.rows || []).length
      ? d.rows
          .slice(0, 6)
          .map(
            (r) => `
      <div class="row">
        <div class="rn"><em>${esc(r.emoji)}</em><b>${esc(r.name)}</b></div>
        <div class="rbar"><i style="width:${Math.max(2, Math.min(100, r.pct))}%"></i></div>
        <div class="rv">${esc(r.valueText)}<u>${esc(r.pctText || "")}</u></div>
      </div>`
          )
          .join("")
      : `<div style="text-align:center">امروز هنوز زمانی ثبت نشده</div>`

    const ava = d.showAvatar
      ? `<div class="ring"><div class="in">${
          d.avatar ? `<img src="${esc(d.avatar)}" alt="">` : `<span>${esc((d.name || "?").trim().charAt(0))}</span>`
        }</div></div>`
      : ""

    return `
<div class="shot${(d.rows || []).length ? "" : " empty-state"}" style="aspect-ratio:${esc(d.ratio || "16/10")}">
  <div class="glow"></div>
  <div class="head">
    <div class="who">
      <div class="name">${esc(d.name)}</div>
      <div class="date">${esc(d.dateText)}</div>
    </div>
    ${ava}
  </div>

  <div class="total">
    <div class="big">${esc(d.totalText)}</div>
    <div class="cap">
      <div class="t">${esc(d.title)}</div>
      <div class="g">${esc(d.goalText)}</div>
    </div>
  </div>

  <div class="goal">
    <div class="track"><i style="width:${Math.max(0, Math.min(100, d.goalPct || 0))}%"></i></div>
    <div class="meta"><span>${esc(d.goalLeftText || "")}</span><span>${esc(d.goalRightText || "")}</span></div>
  </div>

  <div class="rows">${rows}</div>

  <div class="foot">
    <span>${esc(d.streakText)}</span>
    <span class="brand"><i></i>MINDER</span>
  </div>
</div>`
  }

  /* Stand-alone document used for the offscreen PNG capture. */
  function document_(d, fontDir) {
    const a = ASPECTS[d.aspect] || ASPECTS["16:10"]
    const faces = [
      ["ExtraLight", 200], ["Light", 300], ["Regular", 400], ["Medium", 500],
      ["SemiBold", 600], ["Bold", 700], ["ExtraBold", 800], ["Black", 900]
    ]
      .map(
        ([n, w]) =>
          `@font-face{font-family:"Modam";font-weight:${w};font-display:block;src:url("${fontDir}Modam-${n}.ttf") format("truetype")}`
      )
      .join("\n")
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
${faces}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${a.w}px;height:${a.h}px;overflow:hidden;background:#000}
.frame{width:${a.w}px;height:${a.h}px}
.frame > .shot{width:100%;height:100%;border-radius:0}
${cardCss(d.bg)}
</style></head><body><div class="frame">${markup(d)}</div></body></html>`
  }

  window.Card = { ASPECTS, markup, css: cardCss, document: document_ }
})()
