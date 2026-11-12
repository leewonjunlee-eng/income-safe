import React from 'react';
import { toShock, run } from './rules.js';

export const fmt = (x, d = 0) => Number(x).toFixed(d);
export const newWork = () => ({ shocks: {}, judge: {}, memo: '', record: null, schemes: [] });
export const LABEL = ['비상자금', '목표 예금', '투자', '연금'];
export const STATUS = { recheck: '재검증 필요', inprogress: '검증 진행 중', before: '검증 전', adopted: '채택 완료' };

export const Steps = ({ n }) => <div className="steps">{[1, 2, 3, 4, 5, 6].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}</div>;
export const Head = ({ back, title, sub, step, backLabel = '뒤로' }) => (
  <header className="head">
    <div className="row between"><button className="back" onClick={back}>‹ {backLabel}</button>{step && <Steps n={step} />}</div>
    <h1>{title}</h1>{sub && <p className="sub">{sub}</p>}
  </header>
);
export const Foot = ({ children }) => <div className="foot">{children}</div>;
export const GCOL = ['#0f9478', '#e0a800', '#e8851a', '#d93636'];
export const Dot = ({ g }) => <i className="gdot" style={{ background: GCOL[g] }} />;
export const calLabel = (c, at) => { const idx = c.startMonth - 1 + (at - 1); return `${c.startYear + Math.floor(idx / 12)}.${String((idx % 12) + 1).padStart(2, '0')}`; };
export const Slider = ({ value, onChange, min, max, step = 1 }) => <input type="range" className="rng" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />;
export const Field = ({ label, err, children, hint }) => (
  <label className="field"><span>{label}{err && <b className="err"> {err}</b>}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
);
export const NumIn = ({ value, onChange, ...p }) => <input type="number" inputMode="decimal" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...p} />;

export const shocksOf = (c, m) => Object.entries(c.work.shocks).map(([t, p]) => toShock(t, p, m));
export const GR_CLS = ['ok', 'warn-t', 'warn-t', 'err'];

export function Chart({ a, b, target, living, from, to }) {
  const W = 340, H = 150, L = 34, B = 18, n = a.length;
  const max = Math.max(target, ...a, ...b) * 1.08 || 1;
  const x = i => L + (i * (W - L - 4)) / Math.max(1, n - 1), y = v => 6 + (H - B - 6) * (1 - v / max);
  const line = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="월별 비상자금 잔액">
      {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W} y1={y(max / 1.08 * f)} y2={y(max / 1.08 * f)} className="grid" /><text x={L - 4} y={y(max / 1.08 * f) + 3} textAnchor="end">{Math.round(max / 1.08 * f)}</text></g>)}
      <line x1={L} x2={W} y1={y(target)} y2={y(target)} className="tgt" /><text x={W - 2} y={y(target) - 3} textAnchor="end">목표 {Math.round(target / living * 10) / 10}개월</text>
      <path d={line(a)} className="la" /><path d={line(b)} className="lb" />
      <text x={L} y={H - 3}>시작</text><text x={W - 4} y={H - 3} textAnchor="end">{n}개월째</text>
    </svg>
  );
}

export function summary(c, m, plan) { return run(c, null, plan, shocksOf(c, m), m); }