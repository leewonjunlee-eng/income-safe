import React, { useEffect, useState } from 'react';
import { Steps, Head, Field, NumIn, fmt, newWork, LABEL, STATUS, shocksOf, GR_CLS, Chart, summary } from './ui.jsx';
import * as X from './Extra.jsx';
const snapshot = X.snapshot;
import { checkPlan, monthsBetween, annualPlus, SCENARIOS, toShock, run, GRADE_LIST, PROFILE_MAX } from './rules.js';

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
        <p className="muted">인컴 세이프 · AI 제안 검증 도구</p>
        <h1>{nav.v === 'clients' ? '고객' : '오늘의 고객'}</h1>
        <p className="muted">{st.market.asOf.replace(/-/g, '.')} 기준 · 담당 고객 {st.clients.length}명</p>
      </header>
      <section className="pad">
        {nav.v === 'home' && st.clients.length > 0 && (
          <div className="cards3">
            <div className="card sm hi"><span>검증 대기</span><b>{cnt('before') + cnt('inprogress')}</b></div>
            <div className="card sm"><span>재검증</span><b>{cnt('recheck')}</b></div>
            <div className="card sm"><span>채택 완료</span><b className="ok">{cnt('adopted')}</b></div>
          </div>
        )}
        {st.clients.length === 0 && <p className="card muted">등록된 고객이 없습니다</p>}
        <button className="card item" onClick={() => go('sched')}><i className="dot" /><div><b>일정·알림</b><br /><span className="muted">상담·만기·세제·점검 일정</span></div><span>›</span></button>
        <p className="label">고객 · 할 일 순</p>
        {list.map(c => (
          <button key={c.id} className="card item" onClick={() => go(nextScreen(c), c.id)}>
            <i className={`dot ${c.status}`} />
            <div><b>{c.name}</b> <span className="muted">{c.job} · {c.type === 'fixed' ? '고정형' : '변동형'}</span><br /><span className="muted">{STATUS[c.status]}{c.survey && !c.surveyApplied ? ' · 사전 설문 도착' : ''}</span></div>
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

/* ① 고객 정보 */
const TABS = ['소득', '지출', '자산', '목표', '보험·성향'];
function Info({ client: c, upd, go, st }) {
  const [tab, setTab] = useState(0), [copied, setCopied] = useState(false);
  const mo = monthsBetween(c);
  const set = (k, v) => upd({ [k]: v });
  const setInc = (m, v) => upd({ incomeByMonth: { ...c.incomeByMonth, [m]: v } });
  const empty = v => v === '' || v == null;
  const errs = [
    empty(c.type) || empty(c.taxShare) || (c.type === 'fixed' ? empty(c.income) : Object.values(c.incomeByMonth).some(empty)),
    empty(c.living),
    empty(c.emergency) || empty(c.invest) || empty(c.goalDeposit),
    empty(c.goalAmount) || !c.goalName || mo == null || empty(c.emergencyMonths) || empty(c.psychLimit),
    false,
  ];
  const ok = !errs.some(Boolean);
  const target = c.living * c.emergencyMonths;
  const prompt = () => `당신은 재무설계 전문가입니다. 아래 고객에게 맞는 자산배분안(비상자금/목표 예금/투자/연금 월 비중 %)을 제안하세요. 한도와 세율은 현행 기준으로 근거와 함께 쓰세요.\n- 소득: ${c.type === 'fixed' ? `고정형 세후 ${c.income}만원` : `변동형 월 ${Object.values(c.incomeByMonth).join('/')}만원 (1~12월)`}, 세금 몫 ${fmt(c.taxShare * 100)}%\n- 생활비 월 ${c.living}만원, 월 대출 상환 ${c.loanPay || 0}만원\n- 비상자금 ${c.emergency}, 투자자산 ${c.invest}, 목표 예금 ${c.goalDeposit} (만원)\n- 목표: ${c.goalName} ${c.goalAmount}만원, ${c.goalDate} (${mo ?? '-'}개월)\n- 투자성향 ${c.grade}, 심리적 손실 한도 ${c.psychLimit}만원`;
  const save = () => { upd({ months: mo, status: c.status === 'before' ? 'inprogress' : c.status }); go('plan'); };
  return (
    <>
      <Head back={() => go('home')} title={`${c.name} · 고객 정보`} step={1} />
      <div className="tabbar">{TABS.map((t, i) => <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}{errs[i] && <i className="reddot" />}</button>)}</div>
      <section className="pad">
        {c.survey && !c.surveyApplied && <div className="card hi"><b>사전 설문 도착</b><p className="muted">고객이 입력한 답변은 초안입니다. 확인 후 반영하세요.</p><button className="btn" onClick={() => upd(X.applySurvey(c))}>설문 답변을 입력칸에 반영</button></div>}
        {tab === 0 && <>
          <Field label="소득 유형 (필수)"><select value={c.type} onChange={e => upd({ type: e.target.value, taxShare: e.target.value === 'fixed' ? 0 : c.taxShare || 0.15 })}><option value="fixed">고정형</option><option value="variable">변동형</option></select></Field>
          {c.type === 'fixed'
            ? <Field label="월 소득 (세후, 만원)" err={empty(c.income) ? '필수 항목입니다' : ''}><NumIn value={c.income} onChange={v => set('income', v)} /></Field>
            : <><p className="label">월 소득 (만원)</p><div className="grid3">{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <Field key={m} label={`${m}월`}><NumIn value={c.incomeByMonth[m]} onChange={v => setInc(m, v)} /></Field>)}</div></>}
          <Field label="세금 몫 (%)" hint={c.type === 'fixed' ? '고정형은 0으로 고정' : ''}><NumIn disabled={c.type === 'fixed'} value={fmt(c.taxShare * 100)} onChange={v => set('taxShare', v / 100)} /></Field>
        </>}
        {tab === 1 && <>
          <Field label="고정 생활비 (월, 만원)" err={empty(c.living) ? '필수 항목입니다' : ''}><NumIn value={c.living} onChange={v => set('living', v)} /></Field>
          <Field label="월 대출 상환액"><NumIn value={c.loanPay} onChange={v => set('loanPay', v)} /></Field>
          <Field label="대출 잔액"><NumIn value={c.loanBal} onChange={v => set('loanBal', v)} /></Field>
        </>}
        {tab === 2 && <>
          <Field label="비상자금" err={empty(c.emergency) ? '필수 항목입니다' : ''}><NumIn value={c.emergency} onChange={v => set('emergency', v)} /></Field>
          <Field label="투자자산" err={empty(c.invest) ? '필수 항목입니다' : ''}><NumIn value={c.invest} onChange={v => set('invest', v)} /></Field>
          <Field label="목표용 예금" err={empty(c.goalDeposit) ? '필수 항목입니다' : ''}><NumIn value={c.goalDeposit} onChange={v => set('goalDeposit', v)} /></Field>
        </>}
        {tab === 3 && <>
          <Field label="목표 이름"><input value={c.goalName} onChange={e => set('goalName', e.target.value)} /></Field>
          <Field label="목표 금액 (만원)"><NumIn value={c.goalAmount} onChange={v => set('goalAmount', v)} /></Field>
          <Field label="목표 시점" err={mo == null ? '1~60개월 사이로 입력해 주세요' : ''} hint={mo != null ? `기간 ${mo}개월` : ''}><input type="month" value={c.goalDate} onChange={e => set('goalDate', e.target.value)} /></Field>
          <Field label="비상자금 목표 개월수" hint={`목표 금액 = 생활비 × 개월수 = ${fmt(target)}만원 (고정형 3 · 변동형 6 기본)`}><NumIn value={c.emergencyMonths} onChange={v => set('emergencyMonths', v)} /></Field>
          <Field label="심리적 손실 한도 (만원)" hint="면담에서 확인한 견딜 수 있는 최대 손실"><NumIn value={c.psychLimit} onChange={v => set('psychLimit', v)} /></Field>
        </>}
        {tab === 4 && <>
          <Field label="소득보상 보험 월 금액 (만원)"><NumIn value={c.insurance.monthly} onChange={v => set('insurance', { ...c.insurance, monthly: v })} /></Field>
          <Field label="최대 보상 개월수"><NumIn value={c.insurance.months} onChange={v => set('insurance', { ...c.insurance, months: v })} /></Field>
          <Field label="투자성향" hint={`허용 고위험 자산 비중 ${PROFILE_MAX[c.grade]}%`}><select value={c.grade} onChange={e => set('grade', e.target.value)}>{GRADE_LIST.map(g => <option key={g}>{g}</option>)}</select></Field>
          {c.psychLimit < (c.emergency + c.invest + c.goalDeposit) * 0.15 && <p className="warn">손실 회피 성향 강함 (심리 한도가 총자산의 15% 미만)</p>}
        </>}
        <div className="row two"><button className="chip" onClick={() => go('events')}>생애 이벤트</button><button className="chip" onClick={() => go('goals')}>목표 우선순위</button><button className="chip" onClick={() => go('house')}>가구 단위</button></div>
        <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(prompt()); setCopied(true); }}>{copied ? '복사했습니다' : 'AI에 넣을 질문 복사'}</button>
        <button className="btn" disabled={!ok} onClick={save}>저장하고 다음</button>
      </section>
    </>
  );
}

/* ② 배분안 + AI 점검 */
function Plan({ client: c, upd, updWork, go, st }) {
  const [which, setWhich] = useState('A');
  const [ai, setAi] = useState('');
  const key = which === 'A' ? 'planA' : 'planB';
  const plan = c[key];
  const setAlloc = (i, v) => upd({ [key]: { ...plan, alloc: plan.alloc.map((x, j) => (j === i ? v : x)) } });
  const setRe = (f, v) => upd({ [key]: { ...plan, realloc: { ...(plan.realloc || {}), [f]: v } } });
  const sumOf = p => p.alloc.reduce((a, b) => a + (+b || 0), 0);
  const reTot = p => (+p.realloc?.invToEmerg || 0) + (+p.realloc?.invToGoal || 0);
  const checks = checkPlan(c, c.planA, st.market), flagged = checks.filter(r => r.flag);
  const judged = flagged.every(r => c.work.judge[r.id]);
  const errs = [sumOf(c.planA) !== 100 && 'A안 합계가 100%가 아닙니다', sumOf(c.planB) !== 100 && 'B안 합계가 100%가 아닙니다',
    (reTot(c.planA) > c.invest || reTot(c.planB) > c.invest) && '재배치 금액이 투자자산을 넘습니다', !judged && '점검 항목을 모두 판정해 주세요'].filter(Boolean);
  const checksB = checkPlan(c, c.planB, st.market).filter(r => r.flag);
  return (
    <>
      <Head back={() => go('info')} title="배분안 + AI 원안 점검" sub="A안(AI 원안)을 넣고 규칙 7개로 점검한 뒤 B안(수정안)을 만듭니다" step={2} />
      <div className="tabbar">{['A', 'B'].map(w => <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>{w}안 {w === 'A' ? '(AI 원안)' : '(수정안)'}</button>)}</div>
      <section className="pad">
        <div className="card">
          {LABEL.map((l, i) => <Field key={l} label={`${l} (월 배분 %)`}><NumIn value={plan.alloc[i]} onChange={v => setAlloc(i, v)} /></Field>)}
          <p className={sumOf(plan) === 100 ? 'ok' : 'err'}>합계 {sumOf(plan)}%</p>
        </div>
        <div className="card">
          <p className="label">기존 자산 재배치 (선택, 투자자산 {c.invest} 안에서)</p>
          <Field label="투자 → 비상자금"><NumIn value={plan.realloc?.invToEmerg ?? 0} onChange={v => setRe('invToEmerg', v)} /></Field>
          <Field label="투자 → 목표 예금"><NumIn value={plan.realloc?.invToGoal ?? 0} onChange={v => setRe('invToGoal', v)} /></Field>
        </div>
        {which === 'A' && <>
          <Field label="AI가 말한 연금저축 세액공제액 (선택, 만원)"><NumIn value={plan.aiCredit ?? ''} onChange={v => upd({ planA: { ...plan, aiCredit: v } })} /></Field>
          <Field label="AI 답변 캡처/메모 (선택)"><textarea rows={3} value={ai} onChange={e => setAi(e.target.value)} /></Field>
        </>}
        <p className="label">A안 점검 결과 · 주의 {flagged.length}건</p>
        {checks.map(r => (
          <div key={r.id} className={`card chk ${r.flag ? 'flag' : ''}`}>
            <div className="row between"><b>{r.label}</b><span className={r.flag ? 'err' : 'ok'}>{r.flag ? '주의' : '이상 없음'}</span></div>
            <p className="muted">{r.detail}</p>
            {r.flag && <div className="row">
              {[['ok', 'AI 맞음'], ['fix', '수정 반영']].map(([v, l]) => <button key={v} className={`chip ${c.work.judge[r.id] === v ? 'on' : ''}`} onClick={() => updWork({ judge: { ...c.work.judge, [r.id]: v } })}>{l}</button>)}
            </div>}
          </div>
        ))}
        {checksB.length > 0 && <p className="warn">B안도 주의 {checksB.length}건: {checksB.map(r => r.label).join(', ')}</p>}
        {errs.map(e => <p key={e} className="err">{e}</p>)}
        <div className="row two"><button className="chip" onClick={() => go('aicmp')}>AI 답변 비교</button><button className="chip" onClick={() => go('prod')}>상품·세제</button><button className="chip" onClick={() => go('schemes')}>제도</button></div>
        <button className="btn" disabled={errs.length > 0} onClick={() => go('scen')}>시뮬레이션 실행</button>
      </section>
    </>
  );
}

/* ③ 시나리오 선택 */
function Scen({ client: c, updWork, go, st }) {
  const sel = c.work.shocks;
  const n = Object.keys(sel).length;
  const [msg, setMsg] = useState('');
  const toggle = t => {
    const s = { ...sel };
    if (s[t]) delete s[t]; else if (n >= 2) return setMsg('최대 2개까지 선택할 수 있습니다'); else s[t] = { ...SCENARIOS[t].def };
    setMsg(''); updWork({ shocks: s });
  };
  const setP = (t, f, v) => updWork({ shocks: { ...sel, [t]: { ...sel[t], [f]: v } } });
  const errs = Object.entries(sel).filter(([t, p]) => p.at < 1 || p.at > c.months).map(([t]) => `${SCENARIOS[t].name}: 기간(${c.months}개월) 안으로 입력해 주세요`);
  const FIELDS = { stop: [['at', '시작(개월 후)'], ['len', '기간(개월)']], cut: [['drop', '감소율(%)'], ['at', '시작(개월 후)'], ['len', '기간(개월)']], lump: [['amount', '금액(만원)'], ['at', '시작(개월 후)']], rate: [['pp', '상승폭(%p)'], ['at', '시작(개월 후)']], crash: [['at', '시작(개월 후)']], event: [['at', '시작(개월 후)'], ['lump', '목돈'], ['living', '생활비 +'], ['incomePct', '소득 변화(%)'], ['incomeMonths', '소득 기간(개월)']] };
  return (
    <>
      <Head back={() => go('plan')} title="시나리오 선택" sub="두 안에 똑같이 줄 충격을 고르세요 (최대 2개)" step={3} />
      <section className="pad">
        {Object.entries(SCENARIOS).map(([t, s]) => {
          const off = (s.variableOnly && c.type !== 'variable') || (s.loanOnly && !(c.loanBal > 0));
          return (
            <div key={t} className={`card scen ${sel[t] ? 'on' : ''} ${off ? 'off' : ''}`}>
              <button className="scen-h" disabled={off} onClick={() => toggle(t)}><b>{sel[t]?.name ? `${s.name.split('(')[0]}(${sel[t].name})` : s.name}</b><span className="muted">{off ? (s.loanOnly ? '대출 있는 고객만' : '변동형만') : sel[t] ? '선택됨' : '선택'}</span></button>
              {sel[t] && <div className="grid2">
                {FIELDS[t].map(([f, l]) => <Field key={f} label={l}><NumIn value={sel[t][f]} onChange={v => setP(t, f, v)} /></Field>)}
                {t === 'crash' && <Field label="프리셋"><select value={sel[t].preset} onChange={e => setP(t, 'preset', e.target.value)}>{st.market.crashes.map(x => <option key={x.name} value={x.name}>{x.name} −{x.drop}%</option>)}</select></Field>}
              </div>}
              {sel[t] && t === 'stop' && c.insurance.monthly > 0 && <p className="muted">보험 소득보상 월 {c.insurance.monthly}만원 자동 반영</p>}
            </div>
          );
        })}
        {msg && <p className="err">{msg}</p>}{errs.map(e => <p key={e} className="err">{e}</p>)}
        <button className="btn" disabled={errs.length > 0} onClick={() => go('result')}>{n === 0 ? '충격 없이 비교하기' : '결과 비교'}</button>
      </section>
    </>
  );
}


function Result({ client: c, updWork, upd, go, st }) {
  const ins = c.insurance.monthly > 0;
  const A = summary(c, st.market, c.planA), B = summary(c, st.market, c.planB);
  const memoOk = (c.work.memo || '').trim().length >= 10;
  const bz = r => r.bottom ? `${r.bottom}개월째` : '없음';
  const rows = [
    ['비상자금 바닥', bz(A), bz(B), !!A.bottom, !!B.bottom],
    ['최저 비상자금', `${fmt(A.minMonths, 1)}개월`, `${fmt(B.minMonths, 1)}개월`],
    ['강제 매도', `${fmt(A.forced)}만`, `${fmt(B.forced)}만`, A.forced > 0, B.forced > 0],
    [`손실 체감액 (한도 ${c.psychLimit})`, `${fmt(A.loss)} · ${A.overLimit ? '초과' : '이내'}`, `${fmt(B.loss)} · ${B.overLimit ? '초과' : '이내'}`, A.overLimit, B.overLimit],
    ['목표 달성률', `${fmt(A.goalPct)}%`, `${fmt(B.goalPct)}%`],
    ['최고 경보', A.grade, B.grade, A.maxGrade === 3, B.maxGrade === 3],
  ];
  const sentence = `A안은 ${A.bottom ? `${A.bottom}개월째에 비상자금이 바닥나 ${fmt(A.forced)}만원을 팔아야 하고${A.overLimit ? `, 손실 체감액이 한도 ${c.psychLimit}만원을 넘습니다` : ''}` : `비상자금이 바닥나지 않지만 최저 ${fmt(A.minMonths, 1)}개월까지 내려갑니다`}. B안은 ${B.bottom ? `${B.bottom}개월째에 바닥납니다` : `바닥 없이 최저 ${fmt(B.minMonths, 1)}개월을 유지합니다`}. 최고 경보는 A ${A.grade}, B ${B.grade}입니다.`;
  const choose = w => { upd({ adopted: w }); go('record'); };
  return (
    <>
      <Head back={() => go('scen')} title={Object.keys(c.work.shocks).map(t => SCENARIOS[t].name).join(' + ') || '충격 없음'} sub={`${c.name} · ${ins ? '보험 반영' : '보험 미반영'}`} step={4} />
      <section className="pad">
        <div className="card">
          <table className="cmp"><thead><tr><th /><th><span className="pillA">A안</span></th><th><span className="pillB">B안</span></th></tr></thead>
            <tbody>{rows.map(([l, a, b, ae, be]) => <tr key={l}><td>{l}</td><td className={ae ? 'err' : ''}>{a}</td><td className={be ? 'err' : 'okc'}>{b}</td></tr>)}</tbody></table>
        </div>
        <div className="card"><p className="label">월별 비상자금 잔액 <span className="legend"><i className="la" />A <i className="lb" />B</span></p>
          <Chart a={A.emgArr} b={B.emgArr} target={c.living * c.emergencyMonths} living={c.living} /></div>
        <div className="card"><p className="label">AI 해설 초안 <small className="tag">AI 초안</small></p><p>{sentence}</p></div>
        <div className="card note"><Field label="플래너 판단 메모 (필수, 10자 이상)"><textarea rows={3} value={c.work.memo} onChange={e => updWork({ memo: e.target.value })} /></Field></div>
        <div className="row two"><button className="btn ghost" disabled={!memoOk} onClick={() => choose('A')}>A안 채택</button><button className="btn" disabled={!memoOk} onClick={() => choose('B')}>B안 채택 확정</button></div>
        <div className="row two"><button className="chip" onClick={() => go('safety')}>안전선 찾기</button><button className="chip" onClick={() => go('face')}>대면 모드</button></div>
        <div className="row two"><button className="chip" onClick={() => go('retire')}>노후 전망</button><button className="chip" onClick={() => go('prob')}>확률 시뮬레이션</button></div>
        <button className="link" onClick={() => go('plan')}>B안 다시 수정</button>
      </section>
    </>
  );
}

/* ⑤ 설명·확인 기록 */
const RISKS = ['원금 손실 가능성', '시나리오의 한계', '세제 혜택 조건', 'AI 활용 사실'];
function Record({ client: c, updWork, upd, go, st }) {
  const r = c.work.record || { risks: [], confirm: false, note: '' };
  const set = p => updWork({ record: { ...r, ...p } });
  const plan = c.adopted === 'A' ? c.planA : c.planB;
  const maxInv = PROFILE_MAX[c.grade], over = plan.alloc[2] > maxInv;
  const ok = r.risks.length === RISKS.length && r.confirm;
  const save = () => {
    const h = c.history || [], re = c.status === 'recheck';
    updWork({ record: { ...r, at: new Date().toLocaleString('ko-KR'), atISO: st.market.asOf }, review: null });
    const note = re ? '재검증 채택' : h.length ? '재채택' : '최초 제안';
    const v = re ? `v${Math.floor(h.length ? parseFloat(String(h[h.length - 1].v).replace('v', '')) : 1) + 1}` : h.length ? `v1.${h.length}` : 'v1';
    upd({ status: 'adopted', history: [...h, snapshot(c, st.market, v, note)] });
    go(st.settings?.review ? 'review' : 'report');
  };
  return (
    <>
      <Head back={() => go('result')} title="설명·확인 기록" sub={`${c.adopted}안 채택 전 적합성 확인`} step={5} />
      <section className="pad">
        <div className="card"><div className="row between"><span>투자성향</span><b>{c.grade}</b></div><div className="row between"><span>채택안 투자 비중</span><b>{plan.alloc[2]}% (허용 {maxInv}%)</b></div>
          <p className={over ? 'err' : 'ok'}>{over ? '부적합 안입니다. 고객 확인서를 따로 받거나 안을 수정하세요' : '적합'}</p></div>
        <p className="label">설명한 위험 (필수 4개)</p>
        {RISKS.map(x => <label key={x} className="check"><input type="checkbox" checked={r.risks.includes(x)} onChange={e => set({ risks: e.target.checked ? [...r.risks, x] : r.risks.filter(y => y !== x) })} />{x}</label>)}
        <label className="check"><input type="checkbox" checked={r.confirm} onChange={e => set({ confirm: e.target.checked })} />고객이 위 내용을 이해하고 확인함 (필수)</label>
        <Field label="고객 질문 메모 (선택)"><textarea rows={2} value={r.note} onChange={e => set({ note: e.target.value })} /></Field>
        <button className="btn" disabled={!ok} onClick={save}>기록 저장하고 리포트 보기</button>
      </section>
    </>
  );
}

/* ⑤-2 리포트 */
function Report({ client: c, go, st }) {
  const m = st.market;
  const plan = c.adopted === 'A' ? c.planA : c.planB;
  const base = [['충격 없음', []], ['소득 정지 (10개월 후, 3개월)', [['stop', { at: 10 }]]], ['목돈 500 (4개월 후)', [['lump']]], ['투자 급락 2022형 (6개월 후)', [['crash']]]];
  if (c.type === 'variable') base.splice(1, 0, ['소득 감소 −40%', [['cut']]]);
  if (c.loanBal > 0) base.push(['금리 +1%p', [['rate']]]);
  base.push(['복합: 소득 정지 + 2022형 (10개월 후)', [['stop', { at: 10 }], ['crash', { at: 10 }]]]);
  const matrix = base.map(([name, ss]) => {
    const sh = ss.map(([t, o]) => toShock(t, { ...SCENARIOS[t].def, ...o }, m));
    const f = p => run(c, null, p, sh, m);
    return [name, f(c.planA), f(c.planB)];
  });
  const changes = LABEL.map((l, i) => [l, c.planA.alloc[i], c.planB.alloc[i]]).filter(x => x[1] !== x[2]);
  const judges = checkPlan(c, c.planA, m).filter(r => r.flag);
  return (
    <>
      <Head back={() => go('home')} title="검증 리포트" sub={`${c.name} · 시장 기준일 ${m.asOf}`} step={6} />
      <section className="pad report">
        {!c.adopted && <p className="warn">아직 채택하지 않았습니다. ④에서 채택을 확정하세요.</p>}
        <div className="card"><p className="label">채택안</p><b>{c.adopted || '-'}안</b> <span className="muted">{plan.alloc.map((x, i) => `${LABEL[i]} ${x}%`).join(' / ')}</span>
          {c.work.record?.at && <p className="muted">확정 {c.work.record.at}</p>}</div>
        <div className="card"><p className="label">AI 점검 판정 {judges.length}건</p>
          {judges.map(r => <p key={r.id}>• {r.label}: <b>{c.work.judge[r.id] === 'fix' ? '수정 반영' : c.work.judge[r.id] === 'ok' ? 'AI 맞음' : '미판정'}</b> <span className="muted">({r.detail})</span></p>)}</div>
        <div className="card"><p className="label">A → B 변경점</p>{changes.map(([l, a, b]) => <p key={l}>{l}: {a}% → {b}%</p>)}
          {c.planB.realloc && <p>재배치: 투자 → 비상자금 {c.planB.realloc.invToEmerg || 0}, 목표 예금 {c.planB.realloc.invToGoal || 0}</p>}</div>
        <div className="card"><p className="label">스트레스 매트릭스 (A / B)</p>
          <table className="cmp sm"><thead><tr><th>시나리오</th><th>최고 경보</th><th>달성률</th><th>한도</th></tr></thead>
            <tbody>{matrix.map(([n, a, b]) => <tr key={n}><td>{n}</td><td>{a.grade} / {b.grade}</td><td>{fmt(a.goalPct)} / {fmt(b.goalPct)}%</td><td>{a.overLimit ? '초과' : '이내'} / {b.overLimit ? '초과' : '이내'}</td></tr>)}</tbody></table></div>
        {c.work.review?.approvedAt && <div className="card"><p className="label">선임 승인</p><p>{c.work.review.role} · {c.work.review.approvedAt}</p></div>}
        {c.work.review?.rejected && <p className="warn">선임 수정 요청: {c.work.review.opinion}</p>}
        {c.aiChosen && <p className="muted">A안 출처: {c.aiChosen} (AI 답변 비교 점검 기록)</p>}
        <div className="card"><p className="label">플래너 메모</p><p>{c.work.memo || '-'}</p>
          {c.work.record && <><p className="label">설명·확인 기록</p><p>{c.work.record.risks.join(', ')} · 고객 확인 {c.work.record.confirm ? '완료' : '미완'}</p>{c.work.record.note && <p className="muted">질문: {c.work.record.note}</p>}</>}</div>
        <p className="muted small">시장 기준일 {m.asOf}. 투자 {m.invest.value}%·연금 {m.pension.value}% 기대수익률은 팀 가정이며 과거 데이터 검증이 아닙니다. 시나리오는 예측이 아니라 계획의 견고함 비교용입니다. 이 앱의 AI 초안은 설계사 확인 전에는 확정되지 않습니다.</p>
        <div className="row two noprint"><button className="chip" onClick={() => go('proposal')}>고객용 제안서</button><button className="chip" onClick={() => go('monitor')}>모니터링 시작</button><button className="chip" onClick={() => go('history')}>제안 이력</button></div>
        <button className="btn ghost noprint" onClick={() => window.print()}>PDF로 저장 / 인쇄</button>
        <button className="btn noprint" onClick={() => go('home')}>대시보드로</button>
      </section>
    </>
  );
}
