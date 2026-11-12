import React, { useEffect, useState } from 'react';
import { Head, Foot, Field, NumIn, newWork, STATUS } from './ui.jsx';
import * as X from './Extra.jsx';
import { Info, Plan, Scen, Result, Record, Report } from './Screens.jsx';

const KEY = 'income-safe-v2';
const ORDER = { recheck: 0, inprogress: 1, before: 2, adopted: 3 };

async function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.clients) return s; } catch {}
  const [clients, market] = await Promise.all([fetch('/data/clients.json').then(r => r.json()), fetch('/data/market.json').then(r => r.json())]);
  return { clients: clients.map(c => ({ ...c, work: newWork() })), market };
}

export default function App() {
  const [st, setSt] = useState(null);
  const [nav, setNav] = useState({ v: 'home' });
  useEffect(() => { load().then(setSt); }, []);
  useEffect(() => { if (st) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }, [st]);
  if (!st) return <div className="app"><p className="muted pad">불러오는 중…</p></div>;

  const go = (v, id = nav.id) => { setNav({ v, id }); window.scrollTo(0, 0); };
  const client = st.clients.find(c => c.id === nav.id);
  const upd = (patch, id = nav.id) => setSt(s => ({ ...s, clients: s.clients.map(c => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) }));
  const updWork = (patch) => upd(c => ({ work: { ...c.work, ...patch } }));
  const P = { st, setSt, go, client, upd, updWork, nav };
  const tab = ['home', 'clients', 'market', 'settings'].includes(nav.v);
  const View = { home: Home, clients: Home, market: Market, settings: Settings, info: Info, plan: Plan, scen: Scen, result: Result, record: Record, report: Report, consent: X.Consent, survey: X.Survey, events: X.Events, goals: X.Goals, house: X.House, aicmp: X.AiCompare, prod: X.Prod, schemes: X.Schemes, safety: X.Safety, face: X.Face, retire: X.Retire, prob: X.Prob, review: X.Review, proposal: X.Proposal, monitor: X.Monitor, history: X.History, sched: X.Schedule, demos: X.Demos }[nav.v];
  return (
    <div className="app">
      <View {...P} />
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


/* ⓪ 대시보드 */
function Home({ st, go, setSt, nav }) {
  const [adding, setAdding] = useState(false), [name, setName] = useState('');
  const list = [...st.clients].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const cnt = s => st.clients.filter(c => c.status === s).length;
  const nextScreen = c => ({ before: 'info', inprogress: c.work.record ? 'report' : 'plan', recheck: 'scen', adopted: 'report' }[c.status]);
  const add = () => {
    if (!name.trim()) return;
    const base = st.clients.find(c => c.type === 'fixed') || st.clients[0];
    const id = 'c' + Date.now();
    setSt(s => ({ ...s, clients: [...s.clients, { ...base, id, name: name.trim(), status: 'before', work: newWork(), job: '신규', planA: { alloc: [10, 30, 50, 10] }, planB: { alloc: [40, 50, 0, 10] } }] }));
    go('info', id);
  };
  return (
    <>
      <header className="head">
        <p className="sub top">인컴 세이프 <span>AI 제안 검증 도구</span></p>
        <h1>{nav.v === 'clients' ? '고객' : '오늘의 고객'}</h1>
        <p className="sub">{st.market.asOf.replace(/-/g, '.')} ({'일월화수목금토'[new Date(st.market.asOf).getDay()]}) · 담당 고객 {st.clients.length}명</p>
      </header>
      <section className="pad">
        {nav.v === 'home' && st.clients.length > 0 && (
          <>
            <div className="cards3">
              <div className="card sm hi"><span>검증 대기</span><b>{cnt('before') + cnt('inprogress')}</b></div>
              <div className="card sm"><span>재검증 필요</span><b className={cnt('recheck') ? 'err' : ''}>{cnt('recheck')}</b></div>
              <div className="card sm"><span>정상</span><b className="ok">{cnt('adopted')}</b></div>
            </div>
            <div className="card todo"><p className="ttl">오늘 할 일</p>
              {st.clients.filter(c => c.survey && !c.surveyApplied).map(c => <p key={c.id + 's'}>• {c.name} 사전 설문 도착</p>)}
              {st.clients.filter(c => c.status === 'recheck').map(c => <p key={c.id + 'r'}>• {c.name} 재검증 필요 <b className="err">· 경보</b></p>)}
              {st.clients.filter(c => c.status === 'inprogress').map(c => <p key={c.id + 'i'}>• {c.name} 채택·설명 기록 <b className="nv">· 검증 진행 중</b></p>)}
              {!st.clients.some(c => c.survey && !c.surveyApplied) && !st.clients.some(c => c.status === 'recheck' || c.status === 'inprogress') && <p className="muted">오늘 처리할 일이 없습니다</p>}
            </div>
          </>
        )}
        {st.clients.length === 0 && <p className="card muted">등록된 고객이 없습니다</p>}
        <button className="card item" onClick={() => go('sched')}><i className="dot" /><div><b>일정·알림</b><br /><span className="muted">상담·만기·세제·점검 일정</span></div><span>›</span></button>
        <p className="label">고객 · 할 일 순</p>
        {list.map(c => (
          <button key={c.id} className="card item" onClick={() => go(nextScreen(c), c.id)}>
            <i className={`dot ${c.status}`} />
            <div><b className="nm">{c.name}</b> <span className="muted">{c.job} · {c.type === 'fixed' ? '고정형' : '변동형'}</span><br /><span className="muted">{STATUS[c.status]}{c.survey && !c.surveyApplied ? ' · 사전 설문 도착' : ''}</span></div>
            <span>›</span>
          </button>
        ))}
        {adding ? (
          <div className="card"><Field label="새 고객 이름"><input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
            <button className="btn" onClick={add}>등록하고 고객 정보 입력</button></div>
        ) : <button className="dashed" onClick={() => setAdding(true)}>+ 새 고객 등록</button>}
        <p className="muted center">고객 정보는 이 기기에만 저장됩니다</p>
      </section>
    </>
  );
}

/* ⓪-2 시장 환경 */
function Market({ st, setSt }) {
  const [m, setM] = useState(st.market), [saved, setSaved] = useState(false);
  const keys = [['policy', '기준금리'], ['deposit', '예금 금리'], ['loan', '가계대출 금리'], ['cpi', '소비자물가 상승률'], ['invest', '투자 기대수익률'], ['pension', '연금 기대수익률']];
  const bad = k => Math.abs(m[k].value) > 20 || m[k].value === '';
  const set = (k, f, v) => { setSaved(false); setM({ ...m, [k]: { ...m[k], [f]: v } }); };
  const ok = !!m.asOf && keys.every(([k]) => !bad(k));
  return (
    <>
      <header className="head"><h1>시장 환경</h1><p className="muted">모든 고객 시뮬레이션에 공통으로 쓰는 가정</p></header>
      <section className="pad">
        <Field label="기준일 (필수)"><input type="date" value={m.asOf} onChange={e => { setSaved(false); setM({ ...m, asOf: e.target.value }); }} /></Field>
        {keys.map(([k, l]) => (
          <div className="card" key={k}>
            <Field label={`${l} (%)`} err={bad(k) ? '값을 확인해 주세요' : ''}><NumIn step="0.01" value={m[k].value} onChange={v => set(k, 'value', v)} /></Field>
            <input className="src" value={m[k].src} onChange={e => set(k, 'src', e.target.value)} placeholder="출처" />
          </div>
        ))}
        <p className="label">투자 급락 프리셋</p>
        {m.crashes.map((c, i) => (
          <div className="card row between" key={c.name}><b>{c.name}</b><span className="muted">{c.months}개월 · 하락률</span>
            <NumIn style={{ width: 70 }} value={c.drop} onChange={v => { setSaved(false); setM({ ...m, crashes: m.crashes.map((x, j) => (j === i ? { ...x, drop: v } : x)) }); }} />%</div>
        ))}
        <button className="btn" disabled={!ok} onClick={() => { setSt(s => ({ ...s, market: m })); setSaved(true); }}>저장하고 전체 고객 재계산</button>
        {saved && <p className="ok center">저장했습니다. 이후 모든 계산이 새 값으로 계산됩니다.</p>}
      </section>
    </>
  );
}

function Settings({ st, setSt, go }) {
  return (
    <>
      <header className="head"><h1>설정</h1></header>
      <section className="pad">
        <button className="btn ghost" onClick={() => { if (confirm('저장된 고객·시장 데이터를 모두 지우고 처음 상태로 돌립니다.')) { localStorage.removeItem(KEY); location.reload(); } }}>데이터 초기화</button>
        <label className="check"><input type="checkbox" checked={!!st.settings?.review} onChange={e => setSt(s => ({ ...s, settings: { ...s.settings, review: e.target.checked } }))} />선임 검토 사용 (조직에서 쓸 때)</label>
        <button className="btn ghost" onClick={() => go('demos')}>시연 화면 보기</button>
        <p className="label">고객용 화면 열기 (상담 준비 링크)</p>
        {st.clients.map(c => <button key={c.id} className="chip big" onClick={() => go('consent', c.id)}>{c.name} 님 상담 준비 링크</button>)}
        <p className="muted">시연 화면(서류 자동 입력, 마이데이터, 알림 발송, 시장 데이터 자동 갱신)은 외부 연동이 필요해 이번 버전에서 제외했습니다.</p>
      </section>
    </>
  );
}

