/* Jalali (Solar Hijri) calendar conversion — no dependencies.
   Based on the well-known Birashk/Borkowski algorithm used by jalaali-js. */
(function () {
  "use strict"
  const div = (a, b) => ~~(a / b)
  const mod = (a, b) => a - ~~(a / b) * b

  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]

  function jalCal(jy) {
    const bl = BREAKS.length
    const gy = jy + 621
    let leapJ = -14
    let jp = BREAKS[0]
    let jm, jump, leap, leapG, march, n, i
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error("Invalid Jalali year " + jy)
    for (i = 1; i < bl; i += 1) {
      jm = BREAKS[i]
      jump = jm - jp
      if (jy < jm) break
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
      jp = jm
    }
    n = jy - jp
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
    march = 20 + leapJ - leapG
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
    leap = mod(mod(n + 1, 33) - 1, 4)
    if (leap === -1) leap = 4
    return { leap: leap, gy: gy, march: march }
  }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
    return d
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
    const i = div(mod(j, 1461), 4) * 5 + 308
    const gd = div(mod(i, 153), 5) + 1
    const gm = mod(div(i, 153), 12) + 1
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
    return { gy: gy, gm: gm, gd: gd }
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy)
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy
    let jy = gy - 621
    const r = jalCal(jy)
    const jdn1f = g2d(gy, 3, r.march)
    let jd, jm, k
    k = jdn - jdn1f
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31)
        jd = mod(k, 31) + 1
        return { jy: jy, jm: jm, jd: jd }
      }
      k -= 186
    } else {
      jy -= 1
      k += 179
      if (jalCal(jy).leap === 1) k += 1
    }
    jm = 7 + div(k, 30)
    jd = mod(k, 30) + 1
    return { jy: jy, jm: jm, jd: jd }
  }

  const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
  const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]
  const WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"]

  function monthLength(jy, jm) {
    if (jm <= 6) return 31
    if (jm <= 11) return 30
    return jalCal(jy).leap === 0 ? 30 : 29
  }

  function fromDate(d) {
    return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()))
  }

  function toDate(jy, jm, jd, h, mi) {
    const g = d2g(j2d(jy, jm, jd))
    return new Date(g.gy, g.gm - 1, g.gd, h || 0, mi || 0, 0, 0)
  }

  /* Saturday = 0 ... Friday = 6 */
  function weekIndex(d) {
    return (d.getDay() + 1) % 7
  }

  window.Jalali = {
    fromDate,
    toDate,
    monthLength,
    weekIndex,
    MONTHS,
    WEEKDAYS,
    WEEKDAYS_SHORT,
    isLeap: (jy) => jalCal(jy).leap === 0
  }
})()
