import React, { useEffect, useState } from 'react';
import { newWork } from './ui.jsx';
import * as X from './Wire.jsx';
import { Info, Plan, Scen, Result, Report } from './Screens.jsx';
import { inputProblems } from './rules.js';
import * as I from './Integ.jsx';

class Boundary extends React.Component {
  state = { e: null };
  static getDerivedStateFromError(e) { return { e }; }
  componentDidUpdate(p) { if (this.state.e && p.k !== this.props.k) this.setState({ e: null }); }
  render() {
    if (!this.state.e) return this.props.children;
    return <div className="pad"><div className="card"><b>화면을 열지 못했습니다</b><p className="muted">저장된 데이터 모양이 맞지 않을 수 있습니다. 홈으로 돌아가거나, 데이터를 초기화해 처음 상태로 시작하세요.</p>
      <button className="btn" onClick={this.props.home}>홈으로</button><button className="btn ghost" onClick={() => { try { localStorage.removeItem('income-safe-v2'); } catch {} location.reload(); }}>데이터 초기화</button></div></div>;
  }
}
const NEED_COMPLETE = ['plan', 'scen', 'result', 'record', 'report', 'review', 'safety', 'face', 'retire', 'prob', 'prod', 'schemes', 'aicmp', 'proposal', 'monitor', 'history', 'house'];

const KEY = 'income-safe-v2';
// 채택 뒤에 이 값들이 바뀌면 확정 리포트가 낡은 것이므로 재검증 상태로 돌린다
const INPUT_KEYS = ['living', 'income', 'incomeByMonth', 'loanPay', 'loanBal', 'emergency', 'invest', 'goalDeposit', 'goalAmount', 'goalDate', 'taxShare', 'insurance', 'emergencyMonths', 'psychLimit', 'grade', 'type', 'planA', 'planB', 'spouse', 'household'];

const validClient = c => c && c.work && c.planA?.alloc?.length === 4 && c.planB?.alloc?.length === 4 && c.insurance && typeof c.months === 'number';
const validStore = s => s && Array.isArray(s.clients) && s.clients.every(validClient) && s.market?.asOf && s.market.deposit && s.market.crashes;

async function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (validStore(s)) return { ...s, marketLog: Array.isArray(s.marketLog) ? s.marketLog : I.SEED_LOG, outbox: Array.isArray(s.outbox) ? s.outbox : I.SEED_OUT };
  } catch {}
  const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); });
  const [clients, market] = await Promise.all([get('/data/clients.json'), get('/data/market.json')]);
  return { clients: clients.map(c => ({ ...c, work: newWork() })), market, marketLog: I.SEED_LOG, outbox: I.SEED_OUT };
}

export default function App() {
  const [st, setSt] = useState(null), [err, setErr] = useState(null), [saveErr, setSaveErr] = useState(false);
  const [nav, setNav] = useState({ v: 'home' });
  const boot = () => { setErr(null); load().then(setSt).catch(e => setErr(e.message || '불러오지 못했습니다')); };
  useEffect(boot, []);
  // 하루 한 번(09시 이후) 앱을 열 때 시장 데이터를 조용히 확인 — 키가 없거나 실패하면 그냥 넘어간다
  const stRef = React.useRef(null); stRef.current = st;
  useEffect(() => {
    if (!st) return;
    const s = stRef.current, today = new Date().toISOString().slice(0, 10);
    if (s.settings?.autoRefresh === false || new Date().getHours() < 9 || (s.lastRefresh || '').slice(0, 10) === today) return; // 아직 때가 아니면 표시를 남기지 않는다
    try { if (sessionStorage.getItem('mkt-auto') === today) return; sessionStorage.setItem('mkt-auto', today); } catch {}
    I.refreshMarket(s, fn => setSt(fn)).catch(() => {});
  }, [!!st]);
  useEffect(() => {
    if (!st) return;
    try { localStorage.setItem(KEY, JSON.stringify(st)); setSaveErr(false); } catch { setSaveErr(true); }
  }, [st]);
  // 브라우저 뒤로가기를 앱 화면 이동과 연결
  useEffect(() => {
    history.replaceState({ v: 'home' }, '');
    const pop = e => { setNav(e.state?.v ? e.state : { v: 'home' }); window.scrollTo(0, 0); };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  if (err) return <div className="app"><div className="pad"><div className="card"><b>데이터를 불러오지 못했습니다</b><p className="muted">{err}</p><button className="btn" onClick={boot}>다시 시도</button></div></div></div>;
  if (!st) return <div className="app"><p className="muted pad">불러오는 중…</p></div>;

  const go = (v, id = nav.id, arg) => {
    const p = nav.prev;
    if (p && p.v === v && p.id === id && p.arg === arg) { history.back(); return; } // 이전 화면으로 돌아가는 이동은 이력을 쌓지 않는다
    const next = { v, id, arg, prev: { v: nav.v, id: nav.id, arg: nav.arg } };
    history.pushState({ v, id, arg, prev: next.prev }, '');
    setNav(next); window.scrollTo(0, 0);
  };
  const client = st.clients.find(c => c.id === nav.id);
  const upd = (patch, id = nav.id) => setSt(s => ({
    ...s,
    clients: s.clients.map(c => {
      if (c.id !== id) return c;
      const p = typeof patch === 'function' ? patch(c) : patch;
      const stale = c.status === 'adopted' && p.status === undefined && Object.keys(p).some(k => INPUT_KEYS.includes(k));
      return { ...c, ...p, ...(stale ? { status: 'recheck' } : {}) };
    }),
  }));
  const updWork = patch => upd(c => ({ work: { ...c.work, ...patch } }));
  const P = { st, setSt, go, client, upd, updWork, nav };
  const tab = ['home', 'clients', 'settings'].includes(nav.v);
  const NEEDS_CLIENT = ['info', 'plan', 'scen', 'result', 'record', 'report', 'consent', 'survey', 'events', 'templates', 'goals', 'house', 'aicmp', 'prod', 'schemes', 'safety', 'face', 'retire', 'prob', 'review', 'proposal', 'monitor', 'history', 'docs', 'mydata'].includes(nav.v);
  const View = { home: X.Home, clients: X.Home, market: X.Market, settings: X.Settings, info: Info, plan: Plan, scen: Scen, result: Result, record: X.Record, report: Report, consent: X.Consent, survey: X.Survey, events: X.Events, templates: X.Templates, goals: X.Goals, house: X.House, aicmp: X.AiCompare, prod: X.Prod, schemes: X.Schemes, safety: X.Safety, face: X.Face, retire: X.Retire, prob: X.Prob, review: X.Review, proposal: X.Proposal, monitor: X.Monitor, history: X.History, sched: X.Schedule, docs: I.Docs, mydata: I.MyData, auto: I.Auto, notify: I.Notify }[nav.v] || X.Home;
  const incomplete = client && NEED_COMPLETE.includes(nav.v) && inputProblems(client).length > 0;
  const Safe = NEEDS_CLIENT && !client ? X.Home : incomplete ? Info : View;
  return (
    <div className="app">
      {saveErr && <div className="savebar" role="alert">저장 공간을 쓸 수 없어 변경이 새로고침하면 사라질 수 있습니다.</div>}
      <Boundary k={`${nav.v}:${nav.id}`} home={() => go('home', undefined)}><Safe {...P} /></Boundary>
      {tab && (
        <nav className="tabs">
          {[['home', '홈'], ['clients', '고객'], ['market', '시장 환경'], ['settings', '설정']].map(([k, l]) => (
            <button key={k} className={nav.v === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>
          ))}
        </nav>
      )}
    </div>
  );
}
