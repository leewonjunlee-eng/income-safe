import { simulate } from './engine.js';

export const PROFILE_MAX = { 안정형: 0, 안정추구형: 10, 위험중립형: 30, 적극투자형: 60, 공격투자형: 100 };
export const GRADE_LIST = Object.keys(PROFILE_MAX);

export const toMarket = m => ({ deposit: m.deposit.value / 100, invest: m.invest.value / 100, pension: m.pension.value / 100 });

// 연간 납입 추정 = 12개월 계획 중 가용액이 플러스인 달의 합 × 비중 (4장)
export function annualPlus(c, m, startMonth = c.startMonth) {
  const r = simulate({ client: c, plan: { alloc: [0, 0, 0, 0] }, market: toMarket(m), months: 12, startMonth });
  return r.planPos;
}

// 목표 시점 → 개월 수 (시작월 기준). 1~60 밖이면 null
export function monthsBetween(c) {
  const [y, mo] = c.goalDate.split('-').map(Number);
  const n = (y - c.startYear) * 12 + (mo - c.startMonth) + 1; // 시작 달 포함
  return n >= 1 && n <= 60 ? n : null;
}

// AI 원안 점검 규칙 7개 (기획서 4장). plan = {alloc, aiCredit?}
export function checkPlan(c, plan, m) {
  const [e, g, inv, pen] = plan.alloc;
  const ap = annualPlus(c, m);
  const penYear = (ap * pen) / 100, isaYear = (ap * inv) / 100;
  const emgTarget = c.living * c.emergencyMonths;
  const avgInc = c.type === 'fixed' ? c.income : Object.values(c.incomeByMonth).reduce((a, b) => a + b, 0) / 12;
  const rate = 0.165;
  const maxInv = PROFILE_MAX[c.grade];
  const rules = [
    ['pensionLimit', '연금 한도', penYear > 600, `연금저축 연 납입 추정 ${penYear.toFixed(0)} (한도 600, IRP 합산 900)`],
    ['taxCredit', '세액공제액', plan.aiCredit != null && plan.aiCredit !== '' && Math.abs(plan.aiCredit - penYear * rate) > penYear * rate * 0.1,
      `AI 답변 ${plan.aiCredit || '-'}만 원 / 계산값 약 ${(penYear * rate).toFixed(0)}만 원 (연 납입 ${penYear.toFixed(0)} × 16.5%)`],
    ['isaLimit', 'ISA 한도', isaYear > 2000, `ISA 연 납입 추정 ${isaYear.toFixed(0)} (한도 2,000)`],
    ['emergency', '비상자금 부족', c.emergency + (plan.realloc?.invToEmerg || 0) < emgTarget && inv >= 50, `현재 ${(c.emergency / c.living).toFixed(1)}개월분(목표 ${c.emergencyMonths}개월)인데 투자 ${inv}%`],
    ['period', '기간 불일치', c.months <= 18 && inv >= 50, `목표까지 ${c.months}개월인데 투자 ${inv}%`],
    ['repay', '상환 부담', (c.loanPay || 0) > avgInc * 0.4, `월 상환 ${c.loanPay || 0} / 월평균 소득 ${avgInc.toFixed(0)}`],
    ['suit', '적합성 초과', inv > maxInv, `${c.grade} 허용 ${maxInv}% < 고위험 ${inv}%`],
  ];
  return rules.map(([id, label, flag, detail]) => ({ id, label, flag, detail }));
}

// ③ 시나리오 카드 → 엔진 shock
export const SCENARIOS = {
  stop: { name: '소득 정지', def: { at: 10, len: 3 } },
  cut: { name: '소득 감소', def: { at: 6, len: 6, drop: 40 }, variableOnly: true },
  lump: { name: '목돈 지출', def: { at: 4, amount: 500 } },
  crash: { name: '투자 급락', def: { at: 6, preset: '2022형' } },
  rate: { name: '금리 상승', def: { at: 1, pp: 1 }, loanOnly: true },
  event: { name: '생애 이벤트', def: { name: '출산', at: 12, lump: 300, living: 60, incomePct: -25, incomeMonths: 12 } },
};

export function toShock(type, p, m) {
  if (type === 'cut') return { type, at: p.at, len: p.len, drop: p.drop / 100 };
  if (type === 'crash') return { type, at: p.at, drop: m.crashes.find(x => x.name === p.preset).drop / 100 };
  if (type === 'rate') return { type, at: p.at, pp: p.pp / 100 };
  return { type, ...p };
}

export function run(c, which, plan, shocks, m) {
  const cc = { ...c, insurance: c.insurance };
  return simulate({ client: cc, plan, market: toMarket(m), shocks, months: c.months, startMonth: c.startMonth, opts: { household: !!(c.household && c.spouse) } });
}

/* ④-2 안전선 찾기: 바닥이 사라지는 첫 값 (3가지 방법) */
export function safetyLine(c, m, shocks) {
  const sim = (cc, plan) => simulate({ client: cc, plan, market: toMarket(m), shocks, months: c.months, startMonth: c.startMonth });
  const A = c.planA, ok = r => !r.bottom;
  let m1 = null;
  for (let p = A.alloc[0] + 5; p <= A.alloc[0] + A.alloc[2] && m1 == null; p += 5) {
    const d = p - A.alloc[0];
    if (ok(sim(c, { ...A, alloc: [p, A.alloc[1], A.alloc[2] - d, A.alloc[3]] }))) m1 = p;
  }
  let m2 = null;
  for (let x = 50; x <= c.invest && m2 == null; x += 50) {
    if (ok(sim(c, { ...A, realloc: { ...(A.realloc || {}), invToEmerg: x } }))) m2 = x;
  }
  let m3 = null;
  for (let x = 10; x <= 500 && m3 == null; x += 10) {
    if (ok(sim({ ...c, insurance: { monthly: x, months: 3 } }, A))) m3 = x;
  }
  return { m1, m2, m3 };
}

/* ②-3 상품·세제 */
export function products(c, m, plan) {
  const ap = annualPlus(c, m), [e, g, i, p] = plan.alloc.map(x => (ap * x) / 100);
  return { parking: e, deposit: g, isa: i, pension: p, credit: Math.min(p, 600) * 0.165 }; // 연금저축 공제 대상 한도 600
}

/* ④-4 노후 장기 전망: 60세까지 월 납입 × 연 4% 복리, 현재가치는 물가로 할인 */
export function retirement(c, m, share, shareAfter, switchMonth = 0) {
  const base = annualPlus(c, m) / 12, r = m.pension.value / 100 / 12, years = 60 - c.age, N = years * 12;
  let fv = 0; const series = [0];
  for (let t = 0; t < N; t++) { fv = (fv + (base * (t < switchMonth ? share : shareAfter)) / 100) * (1 + r); if ((t + 1) % 12 === 0) series.push(fv); }
  return { fv, pv: fv / Math.pow(1 + m.cpi.value / 100, years), series };
}

/* ①-5b 이벤트 템플릿 (팀 가정). 주택 구입 월 상환 = 대출금 × r ÷ (1 − (1 + r)^−n) */
export const mortgage = (loan, rate, years) => { const r = rate / 100 / 12, n = years * 12; if (!(n > 0)) return 0; return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n)); };
export const TEMPLATES = {
  결혼: { at: 18, lump: 0, living: 40, incomePct: 0, incomeMonths: 0, note: '목표(입주자금)와 연결' },
  출산: { at: 12, lump: 300, living: 60, incomePct: -25, incomeMonths: 12 },
  이직: { at: 6, lump: 0, living: 0, incomePct: -100, incomeMonths: 2, afterPct: 10, note: '소득 공백 2개월, 이후 +10%' },
  '주택 구입': { at: 12, lump: 2000, living: 0, incomePct: 0, incomeMonths: 0, loan: 20000, years: 30, note: '계약금 목돈 + 주택담보대출 월 상환 추가' },
  육아휴직: { at: 12, lump: 0, living: 60, incomePct: -50, incomeMonths: 12, note: '고용보험 육아휴직 급여 기준 확인 후 고객별 조정' },
  창업: { at: 6, lump: 1000, living: 0, incomePct: -50, incomeMonths: 6, note: '이후 변동형으로 전환' },
};

export function alertLevel(dec, em, T) {
  let g = 0;
  if (dec >= 0.2 || em < T) g = 1;
  if (dec >= 0.3 || em < T * 2 / 3) g = 2;
  if (dec >= 0.5 || em < T / 3) g = 3;
  return g;
}
