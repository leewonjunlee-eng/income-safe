// 인컴 세이프 계산 엔진 — 기획서 4장 규칙. 금액 만 원.
export const GRADES = ['정상', '주의', '경고', '위험'];

// shock: {type:'stop'|'cut'|'lump'|'crash'|'rate'|'event', at:N(N개월 후), ...}
// opts: {household, goals:[{name,amount,end}], rand:{mult,gap,ret}}
export function simulate({ client: c, plan, market: m, shocks = [], months, startMonth, opts = {} }) {
  const n = months;
  const hh = opts.household && c.spouse ? c.spouse : null;
  const baseLiving = hh ? hh.living : c.living;
  const alloc = plan.alloc.map(x => x / 100); // 비상/목표/투자/연금
  const goals = opts.goals?.length ? opts.goals : [{ name: c.goalName, amount: c.goalAmount, end: n }];
  const gb = goals.map(() => 0), gpct = goals.map(() => null);
  let emg = c.emergency + (hh ? hh.emergency : 0), inv = c.invest, pen = 0;
  gb[0] = c.goalDeposit + (hh ? hh.goalDeposit : 0);
  const re = plan.realloc || {};
  emg += re.invToEmerg || 0; gb[0] += re.invToGoal || 0; inv -= (re.invToEmerg || 0) + (re.invToGoal || 0);

  const planInc = [], actInc = [], emgArr = [];
  let forced = 0, crashLoss = 0, bottom = null, minMonths = Infinity, maxGrade = 0, planPos = 0;

  for (let i = 0; i < n; i++) {
    const calM = ((startMonth - 1 + i) % 12) + 1;
    const base = c.type === 'fixed' ? c.income : c.incomeByMonth[calM];
    let inc = base, living = baseLiving, loan = c.loanPay || 0, lump = 0, insurance = 0, crash = 0;
    if (opts.rand) { inc = base * opts.rand.mult[i]; if (opts.rand.gap[i]) inc = 0; }
    for (const s of shocks) {
      const k = i - (s.at - 1);
      if (s.type === 'stop' && k >= 0 && k < s.len) {
        inc = 0;
        if (c.insurance && k < c.insurance.months) insurance = Math.min(c.insurance.monthly, base * (1 - c.taxShare));
      }
      if (s.type === 'cut' && k >= 0 && k < s.len) inc = base * (1 - s.drop);
      if (s.type === 'lump' && k === 0) lump += s.amount;
      if (s.type === 'crash' && k === 0) crash = s.drop;
      if (s.type === 'rate' && k >= 0) loan += (c.loanBal * s.pp) / 12;
      if (s.type === 'event' && k >= 0) {
        if (k === 0) lump += s.lump || 0;
        living += s.living || 0;
        loan += s.loanAdd || 0;
        const im = s.incomeMonths || 0;
        if (k < im) inc = inc * (1 + (s.incomePct || 0) / 100);
        else if (s.afterPct) inc = inc * (1 + s.afterPct / 100);
      }
    }
    planInc.push(base); actInc.push(inc);

    if (crash) { const l = inv * crash; inv -= l; crashLoss += l; }
    const avail = inc * (1 - c.taxShare) + (hh ? hh.income : 0) + insurance - (living + loan);
    const emgTarget = living * c.emergencyMonths;
    // 목표 몫은 기한이 남은 1순위 목표로. 없으면 투자로
    const tk = goals.findIndex((g, k) => g.end > i && gpct[k] === null);
    if (avail >= 0) { // 적립 먼저, 목돈 지출은 그 뒤 비상자금에서 차감
      const full = emg - lump >= emgTarget; // 비상자금이 목표 이상이면 그 몫은 목표 예금으로
      const toGoal = avail * alloc[1] + (full ? avail * alloc[0] : 0);
      emg += full ? 0 : avail * alloc[0];
      if (tk >= 0) gb[tk] += toGoal; else inv += toGoal;
      inv += avail * alloc[2]; pen += avail * alloc[3];
      if (i < 12) planPos += avail;
    }
    let deficit = lump + (avail < 0 ? -avail : 0);
    if (deficit > 0) {
      const fromE = Math.min(emg, deficit); emg -= fromE; deficit -= fromE;
      if (deficit > 0) { const f = Math.min(inv, deficit); inv -= f; forced += f; deficit -= f; if (f > 0 && bottom === null) bottom = i + 1; }
      for (let k = 0; k < gb.length && deficit > 0; k++) { const g = Math.min(gb[k], deficit); gb[k] -= g; deficit -= g; }
    }
    emg *= 1 + m.deposit / 12;
    for (let k = 0; k < gb.length; k++) gb[k] *= 1 + m.deposit / 12;
    inv *= 1 + (opts.rand ? opts.rand.ret[i] : m.invest / 12);
    pen *= 1 + m.pension / 12;
    // 기한이 된 달 끝에 그 목표를 사용 처리
    goals.forEach((g, k) => { if (g.end === i + 1 && gpct[k] === null) { gpct[k] = (gb[k] / g.amount) * 100; gb[k] = 0; } });

    emgArr.push(emg);
    const em = emg / baseLiving; minMonths = Math.min(minMonths, em);
    // 경보
    const a = Math.max(0, i - 2);
    const pl = planInc.slice(a).reduce((x, y) => x + y, 0), ac = actInc.slice(a).reduce((x, y) => x + y, 0);
    const dec = pl ? 1 - ac / pl : 0, T = c.emergencyMonths;
    let g = 0;
    if (dec >= 0.2 || em < T) g = 1;
    if (dec >= 0.3 || em < T * 2 / 3) g = 2;
    if (dec >= 0.5 || em < T / 3) g = 3;
    maxGrade = Math.max(maxGrade, g);
  }
  const loss = forced + crashLoss;
  return {
    bottom, minMonths, forced, crashLoss, loss, overLimit: loss > c.psychLimit,
    goalPct: gpct[0] ?? 0, goalPcts: gpct.map(x => x ?? 0), maxGrade, grade: GRADES[maxGrade], emgArr, planPos, pension: pen,
  };
}

/* ④-5 확률 시뮬레이션: 경로 5,000개, 시드 고정 */
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function monteCarlo({ client: c, plans, market: m, months, startMonth, seed = 2026, paths = 5000, shocks = [] }) {
  const rnd = mulberry32(seed);
  const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const out = plans.map(() => ({ noBottom: 0, g80: 0, g100: 0, over: 0, goals: [], emg: [] }));
  for (let p = 0; p < paths; p++) {
    const mult = [], gap = [], ret = [];
    let gapLeft = 0;
    for (let i = 0; i < months; i++) {
      mult.push(c.type === 'variable' ? Math.max(0, 1 + 0.3 * norm()) : 1);
      if (gapLeft > 0) { gap.push(true); gapLeft--; } else if (rnd() < 0.01) { gap.push(true); gapLeft = 2; } else gap.push(false);
      ret.push(m.invest / 12 + (0.18 / Math.sqrt(12)) * norm());
    }
    plans.forEach((plan, k) => {
      const r = simulate({ client: c, plan, market: m, shocks, months, startMonth, opts: { rand: { mult, gap, ret } } });
      const o = out[k];
      if (!r.bottom) o.noBottom++;
      if (r.goalPct >= 80) o.g80++;
      if (r.goalPct >= 100) o.g100++;
      if (r.forced > c.psychLimit) o.over++;
      o.goals.push(r.goalPct); o.emg.push(r.emgArr);
    });
  }
  const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  return out.map(o => ({
    noBottom: (o.noBottom / paths) * 100, g80: (o.g80 / paths) * 100, g100: (o.g100 / paths) * 100, over: (o.over / paths) * 100,
    medianGoal: pct(o.goals, 0.5),
    band: Array.from({ length: months }, (_, i) => { const col = o.emg.map(a => a[i]); return [pct(col, 0.1), pct(col, 0.5), pct(col, 0.9)]; }),
  }));
}
