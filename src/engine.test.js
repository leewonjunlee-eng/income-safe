import fs from 'fs';
import { simulate } from './engine.js';
const clients = JSON.parse(fs.readFileSync('public/data/clients.json', 'utf8'));
const mk = JSON.parse(fs.readFileSync('public/data/market.json', 'utf8'));
const market = { deposit: mk.deposit.value / 100, invest: mk.invest.value / 100, pension: mk.pension.value / 100 };
const crash22 = { type: 'crash', drop: 0.35 };
const run = (cl, p, shocks, ins) => {
  const c = { ...cl, insurance: ins ? { monthly: ins, months: 3 } : cl.insurance };
  return simulate({ client: c, plan: cl[p], market, shocks, months: cl.months, startMonth: cl.startMonth });
};
const [sy, mj] = clients;
const stop = { type: 'stop', at: 10, len: 3 };
const ev = { type: 'event', at: 12, lump: 300, living: 60, incomePct: -25, incomeMonths: 12 };
// [client, 안, shocks, 보험, 바닥, 최저개월, 강제매도, 평가손, 달성률, 경보] (기획서 6장 정답값)
const cases = [
  [sy, 'planA', [], 0, null, 1.4, 0, 0, 66, '위험'], [sy, 'planB', [], 0, null, 4.2, 0, 0, 91, '주의'],
  [sy, 'planA', [{ type: 'cut', at: 6, len: 6, drop: 0.4 }], 0, null, 0.2, 0, 0, 64, '위험'],
  [sy, 'planB', [{ type: 'cut', at: 6, len: 6, drop: 0.4 }], 0, null, 3.1, 0, 0, 83, '경고'],
  [sy, 'planA', [stop], 0, 11, 0.0, 385, 0, 63, '위험'], [sy, 'planB', [stop], 0, null, 1.4, 0, 0, 81, '위험'],
  [sy, 'planA', [stop], 100, 12, 0.0, 84, 0, 63, '위험'], [sy, 'planB', [stop], 100, null, 2.7, 0, 0, 81, '위험'],
  [sy, 'planA', [{ type: 'lump', at: 4, amount: 500 }], 0, 7, 0.0, 158, 0, 66, '위험'],
  [sy, 'planB', [{ type: 'lump', at: 4, amount: 500 }], 0, null, 2.2, 0, 0, 86, '경고'],
  [sy, 'planA', [{ ...crash22, at: 6 }], 0, null, 1.4, 0, 486, 66, '위험'],
  [sy, 'planB', [{ ...crash22, at: 6 }], 0, null, 4.2, 0, 108, 91, '주의'],
  [sy, 'planA', [stop, { ...crash22, at: 10 }], 0, 11, 0.0, 385, 512, 63, '위험'],
  [sy, 'planB', [stop, { ...crash22, at: 10 }], 0, null, 1.4, 0, 110, 81, '위험'],
  [mj, 'planA', [], 0, null, 1.7, 0, 0, 58, '경고'], [mj, 'planB', [], 0, null, 3.0, 0, 0, 100, '주의'],
  [mj, 'planA', [{ type: 'stop', at: 6, len: 3 }], 0, 7, 0.0, 280, 0, 55, '위험'],
  [mj, 'planB', [{ type: 'stop', at: 6, len: 3 }], 0, 8, 0.0, 48, 0, 73, '위험'],
  [mj, 'planA', [{ type: 'lump', at: 4, amount: 500 }], 0, 4, 0.0, 161, 0, 58, '위험'],
  [mj, 'planB', [{ type: 'lump', at: 4, amount: 500 }], 0, null, 0.6, 0, 0, 84, '위험'],
  [mj, 'planA', [{ ...crash22, at: 6 }], 0, null, 1.7, 0, 259, 58, '경고'],
  [mj, 'planB', [{ ...crash22, at: 6 }], 0, null, 3.0, 0, 108, 100, '주의'],
  [mj, 'planA', [{ type: 'rate', at: 1, pp: 0.01 }], 0, null, 1.7, 0, 0, 57, '경고'],
  [mj, 'planB', [{ type: 'rate', at: 1, pp: 0.01 }], 0, null, 3.0, 0, 0, 99, '주의'],
  [mj, 'planA', [ev], 0, 14, 0.0, 429, 0, 46, '위험'], [mj, 'planB', [ev], 0, 18, 0.0, 247, 0, 65, '위험'],
];
let bad = 0;
for (const [cl, p, sh, ins, bt, mn, fs_, cl_, gp, al] of cases) {
  const r = run(cl, p, sh, ins);
  const got = [r.bottom, +r.minMonths.toFixed(1), Math.round(r.forced), Math.round(r.crashLoss), Math.round(r.goalPct), r.grade];
  const exp = [bt, mn, fs_, cl_, gp, al];
  if (JSON.stringify(got) !== JSON.stringify(exp)) {
    bad++;
    console.log('FAIL', cl.name, p, JSON.stringify(sh), '\n  got', got.join(','), '\n  exp', exp.join(','));
  }
}
const r = run(sy, 'planA', [stop], 0);
console.log('A emg', r.emgArr.map(Math.round).join(','));
console.log('exp   624, 635, 646, 670, 681, 570, 460, 349, 359, 111, 0, 0, 22, 31, 41, 63, 72');
console.log(bad ? `${bad}/${cases.length} FAIL` : 'ALL PASS');
process.exit(bad ? 1 : 0);
