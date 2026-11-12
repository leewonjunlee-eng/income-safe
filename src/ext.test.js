import fs from 'fs';
import { simulate, monteCarlo } from './engine.js';
const [sy] = JSON.parse(fs.readFileSync('public/data/clients.json', 'utf8'));
const mk = JSON.parse(fs.readFileSync('public/data/market.json', 'utf8'));
const market = { deposit: mk.deposit.value / 100, invest: mk.invest.value / 100, pension: mk.pension.value / 100 };
const sp = { income: 280, emergency: 500, goalDeposit: 1000, living: 400 };
const cs = { ...sy, spouse: sp };
const stop = { type: 'stop', at: 10, len: 3 };
const R = (c, p, shocks, months, opts) => simulate({ client: c, plan: c[p], market, shocks, months: months || c.months, startMonth: c.startMonth, opts });
const f = r => `${r.bottom ?? '없음'}|${r.minMonths.toFixed(1)}|${r.goalPcts.map(x => Math.round(x)).join('/')}`;
// 가구 단위
console.log('HH 충격없음  A', f(R(cs, 'planA', [], 0, { household: true })), ' B', f(R(cs, 'planB', [], 0, { household: true })), ' (exp A 2.8·113% B 4.2·175%)');
console.log('HH 소득정지  A', f(R(cs, 'planA', [stop], 0, { household: true })), ' B', f(R(cs, 'planB', [stop], 0, { household: true })), ' (exp A 2.4·108% B 4.2·143%)');
// 다중 목표 49개월
const cm = { ...sy, months: 49 };
const mar = { type: 'event', at: 18, living: 40 };
const goals = car => [{ name: '입주', amount: 3000, end: 17 }, { name: '자동차', amount: 1200, end: car }];
console.log('MG B', f(R(cm, 'planB', [mar], 49, { goals: goals(49) })), '(exp 91/67)', ' A', f(R(cm, 'planA', [mar], 49, { goals: goals(49) })), '(exp 66/39, 30개월째 바닥)');
console.log('MG B 자동차 2029.12', f(R(cm, 'planB', [mar], 49, { goals: goals(37) })), '(exp 41)');
// 확률 시뮬레이션
const t0 = Date.now();
const mc = monteCarlo({ client: sy, plans: [sy.planA, sy.planB], market, months: sy.months, startMonth: sy.startMonth });
console.log('MC ms', Date.now() - t0);
mc.forEach((o, i) => console.log('MC', 'AB'[i], '바닥없음', o.noBottom.toFixed(1), 'g80', o.g80.toFixed(1), 'g100', o.g100.toFixed(1), '강제>300', o.over.toFixed(1), '중앙', o.medianGoal.toFixed(1)));
console.log('exp A 83.0/0.0/0.0/10.3/66.1  B 98.5/91.0/19.4/0.1/88.7');
// 주택 구입 템플릿
const r = 0.0496 / 12, n = 360; console.log('주택 월상환', (200000000 / 10000 * r / (1 - Math.pow(1 + r, -n))).toFixed(1), '(exp 106.9)');
import { safetyLine, products, retirement } from './rules.js';
const stopSh = [{ type: 'stop', at: 10, len: 3 }];
console.log('안전선', JSON.stringify(safetyLine(sy, mk, stopSh)), '(exp 60 / 400 / 130)');
const pr = products(sy, mk, sy.planA), pb = products(sy, mk, sy.planB);
console.log('상품 A', Object.values(pr).map(Math.round).join(','), '(exp 121,242,605,242, 공제 ~40)', ' B', Object.values(pb).map(Math.round).join(','), '(exp 605,424,0,182, ~30)');
const age = { ...sy, age: 27 };
const ra = retirement(age, mk, 20, 20), rb = retirement(age, mk, 15, 20, 17), rc = retirement(age, mk, 15, 15);
console.log('노후 A', Math.round(ra.fv), Math.round(ra.pv), ' B복귀', Math.round(rb.fv), Math.round(rb.pv), ' B유지', Math.round(rc.fv), Math.round(rc.pv), '(exp 16631/6686, 16282/6545, 12474/5014)');
