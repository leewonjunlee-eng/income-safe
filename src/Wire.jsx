import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Head, Foot, Status, Seg, Field, NumIn, Sfx, fmt, comma, won, LABEL, calLabel, shocksOf, summary, copyText, evName, shockOk, TOTAL } from './ui.jsx';
import { checkPlan, annualPlus, SCENARIOS, toShock, run, toMarket, safetyLine, products, retirement, TEMPLATES, mortgage, alertLevel, monthsBetween, inputProblems, PROFILE_MAX } from './rules.js';
import { simulate, monteCarlo, GRADES } from './engine.js';

export const STATUS = { recheck: '재검증 필요', inprogress: '검증 진행 중', before: '검증 전', adopted: '채택 완료' };
const adoptedPlan = c => (c.adopted === 'A' ? c.planA : c.planB);
const DOW = '일월화수목금토';
const addMonths = (iso, k) => { const d = new Date(iso); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 10); };
const daysTo = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const Note = ({ label, tone = 'green', children }) => <div className={`note2 ${tone}`}><b>{label}</b> {children}</div>;
const Badge = ({ tone, children }) => <span className={`bdg ${tone}`}>{children}</span>;
const Row = ({ l, children, sub }) => <div className="kv"><div><span>{l}</span>{sub && <small>{sub}</small>}</div><div className="v">{children}</div></div>;

/* ⓪ 일정 데이터 (일정·알림, 대시보드 공유) */
export function buildSchedule(st) {
  const asOf = st.market.asOf, year = asOf.slice(0, 4);
  const list = [
    { id: 'd1', date: asOf, time: '15:00', title: '민준 첫 상담', cat: '상담', demo: true },
    { id: 'd2', date: asOf.slice(0, 8) + '20', time: '14:00', title: '지호 정기 상담', cat: '상담', demo: true },
    { id: 'd3', date: `${year}-12-12`, title: '수아 ISA 만기 D-0', cat: '만기', auto: true, kind: '만기', demo: true },
  ];
  const targets = st.clients.filter(c => c.planA?.alloc[3] > 0 || c.planB?.alloc[3] > 0).length + 2; // 지호·수아는 시연 고정값
  list.push({ id: 'pension', date: `${year}-12-20`, title: `연말 연금저축·IRP 납입 마감 안내 · 고객 ${targets}명`, cat: '세제', auto: true, kind: '세제', bulk: true });
  st.clients.filter(c => c.status === 'adopted' || c.status === 'recheck').forEach(c => {
    const at = c.work.record?.atISO || asOf;
    list.push({ id: `q-${c.id}`, date: addMonths(at, 2).slice(0, 8) + '01', title: `${c.name} 분기 점검 · 비상자금 목표 진행률`, cat: '점검', auto: true, kind: '리밸런싱', cid: c.id });
    if (c.type === 'variable') {
      const avg = Object.values(c.incomeByMonth).reduce((a, b) => a + b, 0) / 12;
      for (let k = 1; k <= 12; k++) { const d = addMonths(asOf.slice(0, 8) + '01', k), m = +d.slice(5, 7); if (c.incomeByMonth[m] < avg * 0.6) { list.push({ id: `s-${c.id}`, date: d, title: `${c.name} 비수기 진입 · 경보 기준 확인`, cat: '점검', auto: true, kind: '모니터링', cid: c.id }); break; } }
    }
    if (c.isaEnd) list.push({ id: `isa-${c.id}`, date: addMonths(c.isaEnd, -1), due: c.isaEnd, cid: c.id, title: `${c.name} ISA 만기 30일 전 안내`, cat: '만기', auto: true, kind: '만기' });
  });
  return [...list, ...(st.schedule || [])].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
}

/* ⓪ 대시보드 */
const ORD = { recheck: 0, inprogress: 1, before: 2, adopted: 3 };
export function Home({ st, go, setSt, nav }) {
  const [adding, setAdding] = useState(false), [name, setName] = useState('');
  const asOf = st.market.asOf, sched = buildSchedule(st);
  const list = [...st.clients].sort((a, b) => ORD[a.status] - ORD[b.status]);
  const cnt = s => st.clients.filter(c => c.status === s).length;
  const wait = cnt('before') + cnt('inprogress'), soon = sched.filter(x => { const d = daysTo(asOf, x.date); return d >= 0 && d <= 14; }).length;
  const normal = Math.max(0, TOTAL - wait - 2 - cnt('recheck')); // 2 = 일정 임박 시연 고객(지호·수아)
  const nextScreen = c => ({ before: 'info', inprogress: c.work.record ? (st.settings?.review ? 'review' : 'record') : 'plan', recheck: 'scen', adopted: 'report' }[c.status]);
  const sub = c => c.status === 'inprogress' ? `검증 진행 중${Object.keys(c.work.judge || {}).length ? ` · AI 원안 점검 ${Object.keys(c.work.judge).length}건 반영` : ''}` : c.status === 'before' ? `검증 전${c.survey && !c.surveyApplied ? ' · 사전 설문 도착' : ''}` : c.status === 'recheck' ? '재검증 필요 · 모니터링 경보' : `채택 완료 · ${c.adopted}안`;
  const add = () => {
    if (!name.trim()) return;
    const id = 'c' + Date.now();
    setSt(s => ({ ...s, clients: [...s.clients, { ...blankFields(), id, name: name.trim(), job: '신규', startMonth: s.clients[0].startMonth, startYear: s.clients[0].startYear, months: 12 }] }));
    go('info', id);
  };
  const todayItems = sched.filter(x => x.date === asOf);
  return (
    <>
      <header className="head"><Status />
        <p className="sub top">인컴 세이프 <span>AI 제안 검증 도구</span></p>
        <h1>{nav.v === 'clients' ? '고객' : '오늘의 고객'}</h1>
        <p className="sub">{asOf.replace(/-/g, '.')} ({DOW[new Date(asOf).getDay()]}) · 담당 고객 {TOTAL}명</p>
      </header>
      <section className="pad">
        {nav.v === 'home' && <>
          <div className={`cards3 ${cnt('recheck') ? 'four' : ''}`}>
            <div className="card sm hi"><span>검증 대기</span><b>{wait}</b></div>
            <button className="card sm" onClick={() => go('sched')}><span>일정 임박</span><b>{soon}</b></button>
            {cnt('recheck') > 0 && <div className="card sm"><span>재검증 필요</span><b className="err">{cnt('recheck')}</b></div>}
            <div className="card sm"><span>정상</span><b className="ok">{normal}</b></div>
          </div>
          <div className="card todo"><p className="ttl">오늘 할 일</p>
            {todayItems.map(x => { const cl = st.clients.find(c => x.title.startsWith(c.name)); return <p key={x.id}>• {x.time} {x.title}{cl?.survey && !cl.surveyApplied ? <span className="mut"> · 사전 설문 도착</span> : ''}</p>; })}
            {st.clients.filter(c => c.status === 'recheck').map(c => <p key={c.id + 'r'}>• {c.name} 재검증 필요 <b className="err">· 경보</b></p>)}
            {st.clients.filter(c => c.status === 'inprogress').map(c => <p key={c.id + 'i'}>• {c.name} 채택·설명 기록 <b className="nv">· 검증 진행 중</b></p>)}
            <p>• 수아 ISA 만기 안내 <span className="mut">· D-30</span></p>
          </div>
        </>}
        <p className="label">고객 · 할 일 순</p>
        {list.map(c => (
          <button key={c.id} className="card item" onClick={() => go(nextScreen(c), c.id)}>
            <i className={`dot ${c.status}`} />
            <div><b className="nm">{c.name}</b> <span className="muted">{c.job} · {c.type === 'fixed' ? '고정형' : '변동형'}</span><br /><span className="muted">{sub(c)}</span></div><span className="chev">›</span>
          </button>
        ))}
        {[['지호', '프리랜서 디자이너 · 변동형', '다음 상담 11.20'], ['수아', '간호사 · 고정형', 'ISA 만기 D-30']].map(([n, j, s]) => (
          <div key={n} className="card item static"><i className="dot adopted" /><div><b className="nm">{n}</b> <span className="muted">{j}</span><br /><span className="muted">{s}</span></div></div>
        ))}
        {adding ? (
          <div className="card"><Field label="새 고객 이름"><input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} autoFocus placeholder="이름" /></Field>
            <div className="row two"><button className="btn ghost" onClick={() => { setAdding(false); setName(''); }}>취소</button><button className="btn" disabled={!name.trim()} onClick={add}>등록하고 입력 시작</button></div></div>
        ) : <button className="dashed" onClick={() => setAdding(true)}>+ 새 고객 등록</button>}
        <p className="muted center">고객 정보는 이 기기에만 저장됩니다</p>
      </section>
    </>
  );
}

/* ⓪-2 시장 환경 */
function Pct({ value, onChange, digits = 2, label }) {
  const [t, setT] = useState(null);
  return <input inputMode="decimal" aria-label={label} value={t ?? (value === '' ? '' : Number(value).toFixed(digits))} onFocus={() => setT(String(value))}
    onChange={e => { setT(e.target.value); const n = parseFloat(e.target.value); onChange(e.target.value === '' || Number.isNaN(n) ? '' : n); }} onBlur={() => setT(null)} />;
}
export function Market({ st, setSt, go }) {
  const [m, setM] = useState(st.market), [msg, setMsg] = useState(''), [rep, setRep] = useState(null);
  const repRef = useRef(null);
  useEffect(() => { if (rep) repRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [rep]);
  const base = useRef(st.market); // 화면을 연 시점의 값 — 편집한 항목만 골라 저장한다
  const set = (k, f, v) => { setMsg(''); setRep(null); setM({ ...m, [k]: { ...m[k], [f]: v } }); };
  const edited = k => m[k].value !== base.current[k].value;
  const bad = k => m[k].value === '' || Math.abs(m[k].value) > 20;
  const keys = ['policy', 'deposit', 'loan', 'cpi', 'invest', 'pension'];
  const ok = !!m.asOf && !keys.some(bad) && m.crashes.every(c => c.drop !== '' && c.drop > 0 && c.drop < 100);
  const line = (k, l) => (
    <div className={`mrow ${edited(k) ? 'chg' : ''}`} key={k}><span className="ml">{l}{edited(k) && <em className="chgtag">변경</em>}</span>
      <div className="mr"><label className={`mv ${bad(k) ? 'bad' : ''}`}><Pct label={l} digits={['invest', 'pension', 'cpi'].includes(k) ? 1 : 2} value={m[k].value} onChange={v => set(k, 'value', v)} />%</label>
        <input className="msrc" value={m[k].src} onChange={e => set(k, 'src', e.target.value)} aria-label={`${l} 출처`} />{bad(k) && <small className="err">값을 확인해 주세요</small>}</div></div>
  );
  const save = () => {
    const old = st.market, big = ['policy', 'deposit', 'loan'].some(k => Math.abs(m[k].value - old[k].value) >= 0.25) || Math.abs(m.cpi.value - old.cpi.value) >= 0.5;
    const n = st.clients.filter(c => c.status === 'adopted').length;
    const changed = Object.keys(m).filter(k => JSON.stringify(m[k]) !== JSON.stringify(base.current[k]));
    setSt(s => ({ ...s, market: { ...s.market, ...Object.fromEntries(changed.map(k => [k, m[k]])) }, clients: s.clients.map(c => (big && c.status === 'adopted' ? { ...c, status: 'recheck' } : c)) }));
    // 무엇이 바뀌었고 고객 결과가 얼마나 달라졌는지 보여준다 (충격 없는 기본 상황, 채택안 기준)
    const after = { ...old, ...Object.fromEntries(changed.map(k => [k, m[k]])) };
    const NAMES = { policy: '기준금리', deposit: '예금 금리', loan: '가계대출 금리', cpi: '소비자물가', invest: '투자 기대수익률', pension: '연금 기대수익률' };
    const changes = Object.keys(NAMES).filter(k => Math.abs(after[k].value - old[k].value) >= 0.005).map(k => `${NAMES[k]} ${Number(old[k].value).toFixed(2)} → ${Number(after[k].value).toFixed(2)}%`);
    if (JSON.stringify(after.crashes) !== JSON.stringify(old.crashes)) changes.push('투자 급락 프리셋');
    if (after.asOf !== old.asOf) changes.push(`기준일 ${old.asOf.replace(/-/g, '.')} → ${after.asOf.replace(/-/g, '.')}`);
    const rows = st.clients.filter(c => inputProblems(c).length === 0).map(c => {
      const plan = c.adopted === 'A' ? c.planA : c.planB, b = run(c, null, plan, [], old), a = run(c, null, plan, [], after);
      return { id: c.id, name: c.name, goal: [b.goalPct, a.goalPct], min: [b.minMonths, a.minMonths], grade: [b.grade, a.grade], flip: big && c.status === 'adopted' };
    });
    base.current = m;
    setMsg('');
    setRep({ changes, rows, big, n, at: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) });
  };
  return (
    <>
      <header className="head"><Status />
        <div className="row between"><button className="back" onClick={() => go('home')}>‹ 홈</button><span className="hr">AI 제안 검증 도구</span></div>
        <h1>시장 환경</h1><p className="sub">모든 고객의 시뮬레이션에 공통 적용됩니다</p></header>
      <section className="pad">
        {rep && <div className="card rep" ref={repRef} role="status"><div className="row between"><b>재계산 결과</b><span className="muted">{rep.at} 저장</span></div>
          {rep.changes.length ? <ul className="chgs">{rep.changes.map(x => <li key={x}>{x}</li>)}</ul> : <p className="muted">바뀐 값이 없어 결과도 그대로입니다.</p>}
          {rep.rows.length > 0 && <table className="cmp sm"><thead><tr><th>고객</th><th>목표 달성률</th><th>최저 비상자금</th><th>경보</th></tr></thead><tbody>
            {rep.rows.map(r => { const dg = Math.round(r.goal[1]) - Math.round(r.goal[0]), dm = Math.round(r.min[1] * 10) / 10 - Math.round(r.min[0] * 10) / 10; return (
              <tr key={r.id}><td>{r.name}</td>
                <td>{fmt(r.goal[0])}% → <b>{fmt(r.goal[1])}%</b><i className={`dlt ${dg > 0 ? 'up' : dg < 0 ? 'down' : ''}`}>{dg === 0 ? '변화 없음' : `${dg > 0 ? '+' : '−'}${Math.abs(dg)}%p`}</i></td>
                <td>{fmt(r.min[0], 1)} → <b>{fmt(r.min[1], 1)}</b>개월<i className={`dlt ${dm > 0 ? 'up' : dm < 0 ? 'down' : ''}`}>{dm === 0 ? '변화 없음' : `${dm > 0 ? '+' : '−'}${Math.abs(dm).toFixed(1)}`}</i></td>
                <td>{r.grade[0] === r.grade[1] ? r.grade[1] : <>{r.grade[0]} → <b>{r.grade[1]}</b></>}{r.flip && <i className="dlt down">재검증 필요</i>}</td></tr>); })}</tbody></table>}
          {rep.big ? <p className="warn">변동 폭이 커서 채택한 고객 중 재검증이 필요해진 고객이 있습니다. 홈에서 확인하세요.</p> : <p className="muted">변동 폭이 재검증 기준(금리 0.25%p, 물가 0.5%p) 미만이라 채택 상태는 그대로입니다.</p>}</div>}
        <div className="strip"><label>기준일 <input type="date" value={m.asOf} onChange={e => { setMsg(''); setM({ ...m, asOf: e.target.value }); }} /></label><button className="lnk big" onClick={() => go('auto')}>자동 갱신 설정 ›</button></div>
        <div className="card">{line('policy', '기준금리')}{line('deposit', '예금 금리 → 예금 수익률')}{line('loan', '가계대출 금리')}{line('cpi', '소비자물가 상승률')}</div>
        <div className="card">{line('invest', '투자 기대수익률')}{line('pension', '연금 기대수익률')}</div>
        <div className="card"><p className="ttl">투자 급락 프리셋 · 코스피 고점 대비</p>
          {m.crashes.map((c, i) => <div className="crow" key={c.name}><b>{c.label || c.name}</b><span className="muted">{c.period}</span>
            <label className="neg"><span>−</span><NumIn aria-label={`${c.label || c.name} 하락률`} value={c.drop} onChange={v => { setMsg(''); setM({ ...m, crashes: m.crashes.map((x, j) => (j === i ? { ...x, drop: v } : x)) }); }} /><span>%</span></label></div>)}</div>
        {msg && <p className="ok center">{msg}</p>}
      </section>
      <Foot><button className="btn" disabled={!ok} onClick={save}>저장하고 전체 고객 재계산</button></Foot>
    </>
  );
}

export function Settings({ st, setSt, go }) {
  return (
    <>
      <header className="head"><Status /><h1>설정</h1></header>
      <section className="pad">
        <label className="check"><input type="checkbox" checked={!!st.settings?.review} onChange={e => setSt(s => ({ ...s, settings: { ...s.settings, review: e.target.checked } }))} />선임 검토 사용 (조직에서 쓸 때)</label>
        <p className="label">고객용 화면 열기 (상담 준비 링크)</p>
        {st.clients.map(c => <button key={c.id} className="card item" onClick={() => go('consent', c.id)}><div><b>{c.name} 님 상담 준비 링크</b><br /><span className="muted">동의 → 사전 설문</span></div><span className="chev">›</span></button>)}
        <button className="card item" onClick={() => go('auto')}><div><b>시장 데이터 자동 갱신</b><br /><span className="muted">ECOS · KOSIS · 공공데이터포털</span></div><span className="chev">›</span></button>
        <button className="btn ghost" onClick={() => { if (confirm('저장된 고객·시장 데이터를 모두 지우고 처음 상태로 돌립니다.')) { localStorage.removeItem('income-safe-v2'); location.reload(); } }}>데이터 초기화</button>
      </section>
    </>
  );
}

/* ⓪-3 일정·알림 */
export function Schedule({ st, setSt, go }) {
  const [f, setF] = useState('전체'), [range, setRange] = useState(null), [add, setAdd] = useState(null), [sel, setSel] = useState(null), [copied, setCopied] = useState(null);
  const asOf = st.market.asOf, ym = asOf.slice(0, 7), nym = addMonths(asOf.slice(0, 8) + '01', 1).slice(0, 7);
  const all = buildSchedule(st).filter(x => (f === '전체' || x.cat === f) && (!range || x.date.startsWith(range === 'this' ? ym : nym)));
  const BAR = { 상담: '#1e3aaf', 만기: '#e8851a', 세제: '#7c5cc9', 점검: '#0f9478' };
  const dstr = x => (x.date.slice(0, 4) === asOf.slice(0, 4) ? [`${x.date.slice(5).replace('-', '.')} ${DOW[new Date(x.date).getDay()]}`, x.time || (x.cat === '점검' ? '점검' : '알림')] : [x.date.slice(0, 7).replace('-', '.'), '점검']);
  const msg = x => `[안내] ${x.date.replace(/-/g, '.')}${x.time ? ' ' + x.time : ''} ${x.title} 일정이 있습니다. 확인 부탁드립니다.`;
  const target = all.find(x => x.id === sel) || all.find(x => !x.demo && x.cat !== '상담') || all[0];
  const save = () => { if (!add.title.trim() || !add.date) return; setSt(s => ({ ...s, schedule: [...(s.schedule || []), { ...add, id: 'm' + Date.now(), cat: '상담' }] })); setAdd(null); };
  return (
    <>
      <Head back={() => go('home')} backLabel="홈" title="일정·알림" sub="채택안과 고객 정보에서 자동으로 만들어집니다" demo right={<><button className={`lnk ${range === 'this' ? 'on' : ''}`} onClick={() => setRange(range === 'this' ? null : 'this')}>이번 달</button> · <button className={`lnk ${range === 'next' ? 'on' : ''}`} onClick={() => setRange(range === 'next' ? null : 'next')}>다음 달</button></>} />
      <section className="pad">
        <div className="pills">{['전체', '상담', '만기', '세제', '점검'].map(t => <button key={t} className={f === t ? 'on' : ''} onClick={() => setF(t)}>{t}</button>)}</div>
        {all.length === 0 && <p className="muted center">해당하는 일정이 없습니다</p>}
        {all.map(x => { const [d1, d2] = dstr(x); return (
          <button key={x.id} className={`sch ${target?.id === x.id ? 'pick' : ''}`} onClick={() => { setSel(x.id); setCopied(null); }}>
            <div className="sd"><b>{d1}</b><span>{d2}</span></div><i className="sbar" style={{ background: BAR[x.cat] }} />
            <div className="st"><b>{x.title}</b><span>{x.kind || x.cat}{x.auto && <> · <em>자동 등록</em></>}</span></div></button>
        ); })}
        <div className="card sm2"><b>자동 등록 규칙</b> ISA 만기 30일 전, 연말 세액공제 마감 2주 전, 채택안의 점검 주기(분기), 변동형 고객의 비수기 진입 월</div>
        {add && <div className="card"><Field label="날짜"><input type="date" value={add.date} onChange={e => setAdd({ ...add, date: e.target.value })} /></Field><Field label="시간 (선택)"><input type="time" value={add.time || ''} onChange={e => setAdd({ ...add, time: e.target.value })} /></Field><Field label="내용"><input value={add.title} onChange={e => setAdd({ ...add, title: e.target.value })} placeholder="예: 서윤 첫 상담" /></Field><div className="row two"><button className="btn ghost" onClick={() => setAdd(null)}>취소</button><button className="btn" disabled={!add.title.trim() || !add.date} onClick={save}>저장</button></div></div>}
      </section>
      <Foot>
        <button className="btn" disabled={!target} onClick={async () => setCopied((await copyText(msg(target))) ? 'ok' : 'fail')}>{copied === 'ok' ? '복사했습니다' : copied === 'fail' ? '복사하지 못했습니다 · 직접 선택해 복사하세요' : '고객 안내 문구 복사'}</button>
        <div className="row two"><button className="link" onClick={() => setAdd({ date: asOf, time: '', title: '' })}>+ 일정 직접 추가</button><button className="link" onClick={() => go('notify', undefined, target?.id)}>알림 보내기</button></div>
      </Foot>
    </>
  );
}

/* ①-A 개인정보 동의 / ①-B 사전 설문 (고객 화면) */
export function Consent({ client: c, upd, go }) {
  const [ch, setCh] = useState({ req: false, ai: true, spouse: false });
  const Item = ({ k, tag, title, desc, red }) => (
    <button className="cbcard" onClick={() => setCh({ ...ch, [k]: !ch[k] })} aria-pressed={ch[k]}><i className={`cb ${ch[k] ? 'on' : ''}`} /><div><b><em className={red ? 'req' : ''}>[{tag}]</em> {title}</b><p>{desc}</p></div></button>
  );
  return (
    <>
      <header className="head"><Status demo />
        <div className="row between"><span className="sub">고객 화면 · 상담 준비 링크</span><span className="hr">1 / 3</span></div>
        <h1>상담 전에<br />확인해 주세요</h1><p className="sub">담당 재무설계사가 보낸 링크입니다</p></header>
      <section className="pad">
        <Item k="req" red tag="필수" title="개인정보 수집·이용" desc="목적: 재무 상담과 설계 · 항목: 소득, 지출, 자산, 부채, 보험, 목표 · 보유: 상담 종료 시까지(법령상 보관 자료 제외)" />
        <Item k="ai" tag="선택" title="서류 자동 분석(AI 처리)" desc="올린 서류에서 값을 읽는 데 AI를 씁니다. 읽은 값은 설계사가 확인한 뒤에만 쓰입니다." />
        <Item k="spouse" tag="선택" title="배우자 정보 함께 입력" desc="가구 단위 설계를 원할 때만. 배우자 본인의 동의가 따로 필요합니다." />
        <div className="card sm2">동의는 언제든 철회할 수 있고, 철회하면 입력한 정보는 삭제됩니다. 동의 일시와 항목은 상담 기록에 함께 남습니다.</div>
        {ch.ai && <button className="link" onClick={() => go('docs')}>서류로 자동 입력하기</button>}
        <button className="link" onClick={() => go('mydata')}>계좌 정보로 한 번에 채우기</button>
      </section>
      <Foot><button className="btn" disabled={!ch.req} onClick={() => { upd({ consent: { at: new Date().toLocaleString('ko-KR'), items: ch } }); go('survey'); }}>동의하고 시작하기</button><button className="link" onClick={() => go('home')}>나중에 할게요</button></Foot>
    </>
  );
}

const QS = [
  { k: 'type', t: '소득은 매달\n비슷한가요?', ch: [['fixed', '거의 같아요', '월급처럼 매달 비슷하게 들어와요'], ['variable', '달마다 달라요', '협찬·외주처럼 들쭉날쭉해요'], ['unknown', '잘 모르겠어요', '상담 때 같이 정리해요']], extra: { k: 'lowest', q: '최근 1년 중 가장 적게 번 달은?', note: '대략이면 충분해요', when: 'variable' } },
  { k: 'living', t: '매달 꼭 나가는\n돈은 얼마인가요?', num: '월세·통신·보험·대출 이자 같은 고정 지출' },
  { k: 'emergency', t: '비상용으로 따로\n둔 돈이 있나요?', num: '언제든 꺼낼 수 있는 예금·파킹통장' },
  { k: 'invest', t: '투자 중인 자산은\n얼마인가요?', num: '주식·ETF·펀드 평가금액' },
  { k: 'goalDeposit', t: '목표를 위해\n모아 둔 예금은요?', num: '결혼·입주 등 목표용으로 따로 둔 돈' },
  { k: 'loanPay', t: '매달 갚는 대출\n원리금은요?', num: '없으면 0' },
  { k: 'loanBal', t: '남은 대출 잔액은\n얼마인가요?', num: '없으면 0' },
  { k: 'sonjil', t: '실손의료보험에\n가입했나요?', ch: [['yes', '가입했어요', '병원비 실손 보장이 있어요'], ['no', '아직이에요', '없거나 잘 모르겠어요']] },
  { k: 'insurance', t: '일을 못 할 때\n받는 보험금이 있나요?', num: '소득보상 월 금액, 없으면 0' },
  { k: 'goalAmount', t: '이루고 싶은\n목표 금액은요?', num: '입주자금·결혼자금 등' },
  { k: 'grade', t: '투자에서 손실이\n나면 어떻게 하시나요?', ch: [['안정형', '바로 팔아요', '원금이 줄면 불안해요'], ['안정추구형', '많이 불안해요', '조금만 줄어도 신경 쓰여요'], ['위험중립형', '조금 지켜봐요', '오르내림은 있다고 생각해요'], ['적극투자형', '더 사요', '싸게 살 기회라고 봐요'], ['공격투자형', '크게 베팅해요', '큰 변동도 괜찮아요']] },
];
export function Survey({ client: c, upd, go }) {
  const [i, setI] = useState(0), [a, setA] = useState(c.survey || {}), [done, setDone] = useState(false);
  const q = QS[i], v = a[q.k];
  const needLow = q.extra && a[q.k] === q.extra.when;
  const ok = v !== undefined && v !== '' && (!needLow || (a[q.extra.k] !== undefined && a[q.extra.k] !== ''));
  const left = Math.max(1, Math.ceil(((QS.length - i) * 20) / 60));
  const send = () => { upd({ survey: a, surveyAt: new Date().toLocaleString('ko-KR'), surveyApplied: false }); setDone(true); };
  if (done) return (
    <>
      <header className="head"><Status demo /><div className="row between"><span className="sub">고객 화면 · 상담 준비 링크</span><span className="hr">3 / 3</span></div><h1>보냈어요</h1><p className="sub">답변은 담당 설계사에게만 전달됩니다</p></header>
      <section className="pad"><div className="card"><p>상담에서 함께 확인하고 고칠게요. 정확하지 않아도 괜찮습니다.</p></div></section>
      <Foot><button className="btn" onClick={() => go('home')}>설계사 화면으로</button></Foot>
    </>
  );
  return (
    <>
      <header className="head"><Status demo />
        <div className="row between"><span className="sub">고객 화면 · 상담 준비 링크</span><span className="hr">2 / 3</span></div>
        <div className="bar"><i style={{ width: `${((i + 1) / QS.length) * 100}%` }} /></div>
        <h1>{q.t.split('\n').map((x, k) => <React.Fragment key={k}>{k > 0 && <br />}{x}</React.Fragment>)}</h1><p className="sub">질문 {i + 1} / {QS.length} · 약 {left}분 남음</p></header>
      <section className="pad">
        {q.ch ? q.ch.map(([k, t, d]) => <button key={k} className={`opt2 ${v === k ? 'on' : ''}`} onClick={() => setA({ ...a, [q.k]: k })}><b>{t}</b><span>{d}</span></button>)
          : <div className="card"><div className="row"><label className="sfx grow"><NumIn value={v ?? ''} onChange={x => setA({ ...a, [q.k]: x })} autoFocus /><span>만 원</span></label></div><p className="muted">{q.num}</p></div>}
        {needLow && <div className="card"><p className="ttl">{q.extra.q}</p><div className="row"><label className="sfx grow"><NumIn value={a[q.extra.k] ?? ''} onChange={x => setA({ ...a, [q.extra.k]: x })} /><span>만 원</span></label><span className="muted">{q.extra.note}</span></div></div>}
        <p className="muted center">답변은 담당 설계사에게만 전달됩니다<br />정확하지 않아도 상담에서 함께 고칩니다</p>
        <button className="link" onClick={() => { if (confirm('동의를 철회하면 이 고객의 입력 정보(소득·지출·자산·목표·설문)가 모두 삭제됩니다.')) { upd(wipe()); go('home'); } }}>동의 철회</button>
      </section>
      <Foot>{i < QS.length - 1 ? <button className="btn" disabled={!ok} onClick={() => setI(i + 1)}>다음</button> : <button className="btn" disabled={!ok} onClick={send}>설계사에게 보내기</button>}
        <button className="link" disabled={i === 0} onClick={() => setI(i - 1)}>이전</button></Foot>
    </>
  );
}
export const blankFields = () => ({ type: 'fixed', taxShare: 0, income: '', incomeByMonth: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, ''])), living: '', loanPay: 0, loanBal: 0, emergency: '', invest: '', goalDeposit: '', goalAmount: '', goalName: '목표', goalDate: '',
  emergencyMonths: 3, psychLimit: '', grade: '위험중립형', insurance: { monthly: 0, months: 3 }, sonjil: false, hospitalDaily: 0, age: 30, events: [], goalList: undefined, spouse: undefined, household: false, aiAnswers: undefined, aiChosen: undefined, history: [], adopted: null, pick: null, recheckInfo: null,
  survey: null, consent: null, surveyApplied: false, status: 'before', planA: { alloc: [10, 30, 50, 10] }, planB: { alloc: [40, 50, 0, 10] }, work: { shocks: {}, judge: {}, memo: '', record: null, schemes: [] } });
export const wipe = () => blankFields(); // 동의 철회: 고객 입력 전체를 빈 상태로
export function applySurvey(c) {
  const s = c.survey, p = { surveyApplied: true };
  if (s.type === 'fixed' || s.type === 'variable') { p.type = s.type; p.taxShare = s.type === 'fixed' ? 0 : c.taxShare || 0.15; p.emergencyMonths = s.type === 'fixed' ? 3 : 6; }
  ['living', 'emergency', 'invest', 'goalDeposit', 'loanPay', 'loanBal', 'goalAmount'].forEach(k => { if (s[k] !== undefined && s[k] !== '') p[k] = s[k]; });
  if (s.insurance !== undefined && s.insurance !== '') p.insurance = { ...c.insurance, monthly: s.insurance };
  if (s.sonjil) p.sonjil = s.sonjil === 'yes';
  if (s.grade) p.grade = s.grade;
  return p;
}

/* ①-5 생애 이벤트 / ①-5b 템플릿 */
const evSum = (n, p) => ({ 결혼: `생활비 +${p.living} / 월`, 출산: `${p.lump} · 생활비 +${p.living} · 소득 ${p.incomePct}% ${p.incomeMonths}개월`, 이직: `소득 공백 ${p.incomeMonths}개월 · 이후 소득 +${p.afterPct || 0}%`, '주택 구입': `계약금 ${comma(p.lump)} · 대출 ${comma(p.loan || 0)} · ${p.years || 30}년`, 육아휴직: `소득 ${p.incomePct}% ${p.incomeMonths}개월 · 생활비 +${p.living}`, 창업: `초기 자금 ${comma(p.lump)} · 소득 ${p.incomePct}% ${p.incomeMonths}개월 → 변동형` }[n]);
const evParams = n => ({ ...TEMPLATES[n], ...(n === '주택 구입' ? { price: 40000, loan: 20000 } : {}) });
export function Events({ client: c, upd, updWork, go, st, nav }) {
  const fromScen = nav.prev?.v === 'scen'; // 시나리오 선택에서 들어왔으면 그 화면으로 돌아간다
  const evs = c.events || [], has = n => evs.some(e => e.name === n), [msg, setMsg] = useState('');
  const toggle = n => { setMsg(''); upd(x => ({ events: has(n) ? evs.filter(e => e.name !== n) : [...evs, { name: n, ...evParams(n) }], work: { ...x.work, shocks: Object.fromEntries(Object.entries(x.work.shocks).filter(([t]) => t !== 'event')) } })); };
  const dateOf = e => (e.name === '결혼' ? c.goalDate.replace('-', '.') : e.at > c.months ? `${calLabel(c, e.at).slice(0, 4)} 예정` : calLabel(c, e.at));
  const pts = [...evs].sort((a, b) => a.at - b.at);
  const send = () => {
    const inn = pts.filter(x => x.at >= 1 && x.at <= c.months && x.name !== '결혼'); // 결혼은 목표(입주) 시점으로 이미 연결돼 있어 시나리오로 보내지 않는다
    if (!inn.length) return setMsg(`시뮬레이션 기간(${c.months}개월) 안에 있는 이벤트가 없습니다. 결혼은 목표와 연결돼 있고, 나머지는 시점을 기간 안으로 줄이면 보낼 수 있습니다.`);
    const sh = c.work.shocks;
    if (!sh.event && Object.keys(sh).length >= 2) return setMsg('시나리오는 최대 2개입니다. ③에서 하나를 해제하세요.');
    const list = inn.map(e => (e.name === '주택 구입' && !(e.loanAdd > 0) ? { ...e, loanAdd: mortgage(Math.max(0, (e.price || 40000) - (e.lump || 0)), st.market.loan.value, e.years || 30) } : e));
    updWork({ shocks: { ...sh, event: list } }); go('scen');
  };
  return (
    <>
      <Head back={() => go(fromScen ? 'scen' : 'info')} backLabel={fromScen ? '시나리오 선택' : '고객 정보'} title="생애 이벤트" sub="예정된 일을 고르면 현금흐름에 반영됩니다" step={1} />
      <section className="pad">
        <div className="card"><p className="ttl">템플릿</p><div className="chips">{Object.keys(TEMPLATES).map(n => <button key={n} className={`chip ${has(n) ? 'on' : ''}`} aria-pressed={has(n)} onClick={() => toggle(n)}>{n}</button>)}</div></div>
        {pts.length > 0 && <div className="card tl"><div className="line" />
          <div className="tp" style={{ left: '12%' }}><b>지금</b><i style={{ background: '#1e3aaf' }} /><span>{calLabel(c, 1)}</span></div>
          {pts.map((e, k) => <div className="tp" key={e.name} style={{ left: `${12 + ((k + 1) / pts.length) * 76}%` }}><b>{e.name === '결혼' ? '결혼·입주' : e.name}</b><i style={{ background: e.name === '결혼' ? '#0f9478' : '#7c5cc9' }} /><span>{dateOf(e)}</span></div>)}</div>}
        {pts.map(e => (
          <button key={e.name} className={`evc ${e.name === '결혼' ? 'g' : 'p'}`} onClick={() => go('templates', c.id, e.name)}>
            <div className="row between"><b>{e.name === '결혼' ? '결혼·입주' : e.name}</b><span className="tg">{e.name === '결혼' ? '목표와 연결됨' : e.at > c.months ? '기간 밖 · 시뮬레이션 제외' : '기간 안 · 보내기로 반영'}</span></div>
            {e.name === '결혼' ? <p>{dateOf(e)} · {c.goalName} {comma(c.goalAmount)}만 원 사용 · 이후 생활비 +{e.living}만 원 / 월</p>
              : <>{e.lump > 0 && <Row l={e.name === '출산' ? '출산 비용' : '목돈 지출'}>{comma(e.lump)}만 원</Row>}{e.living > 0 && <Row l="생활비 변화">+{e.living}만 원 / 월</Row>}{e.incomeMonths > 0 && <Row l="소득 변화">{e.incomePct}% · {e.incomeMonths}개월</Row>}{e.loanAdd > 0 && <Row l="대출 상환">월 {fmt(e.loanAdd)}만 원</Row>}<small className="muted">고객별로 수정할 수 있습니다</small></>}
          </button>
        ))}
        {pts.length === 0 && <p className="muted center">위 템플릿에서 예정된 일을 골라 주세요</p>}
        {msg && <p className="err">{msg}</p>}
      </section>
      <Foot><button className="btn" onClick={() => go(fromScen ? 'scen' : 'info')}>{fromScen ? '저장하고 시나리오로' : '저장하고 다음'}</button><button className="link" onClick={send}>시나리오로 바로 보내기</button></Foot>
    </>
  );
}

export function Templates({ client: c, upd, go, st, nav }) {
  const start = nav.arg || '주택 구입', evs = c.events || [];
  const [sel, setSel] = useState(start);
  const [ed, setEd] = useState(() => ({ ...evParams(start), ...(evs.find(e => e.name === start) || {}) }));
  const pick = n => { setSel(n); setEd({ ...evParams(n), ...(evs.find(e => e.name === n) || {}) }); };
  const house = sel === '주택 구입', rate = st.market.loan.value;
  const loan = house ? Math.max(0, (ed.price || 0) - (ed.lump || 0)) : 0, monthly = house && ed.years > 0 ? mortgage(loan, rate, ed.years) : 0;
  const F = (k, l, u) => <Row l={l}><label className="inl"><NumIn aria-label={l} value={ed[k] ?? 0} onChange={v => setEd({ ...ed, [k]: v })} />{u && <span>{u}</span>}</label></Row>;
  const atOk = Number.isInteger(+ed.at) && +ed.at >= 1;
  const add = () => { if (!atOk) return; const e = { name: sel, ...ed, at: +ed.at, ...(house ? { loan, loanAdd: monthly } : {}) }; upd(x => ({ events: [...evs.filter(y => y.name !== sel), e], work: { ...x.work, shocks: Object.fromEntries(Object.entries(x.work.shocks).filter(([t]) => t !== 'event')) } })); go('events'); };
  return (
    <>
      <Head back={() => go('events')} backLabel="생애 이벤트" title="이벤트 템플릿" sub="고객마다 값을 고칠 수 있습니다" step={1} demo />
      <section className="pad">
        {Object.keys(TEMPLATES).map(n => n !== sel ? (
          <button key={n} className="card tcard" onClick={() => pick(n)}><div className="row between"><b>{n}</b>{n === '결혼' && <span className="tg g">목표(입주자금)와 연결</span>}</div><p className="muted">{evSum(n, { ...evParams(n), ...(evs.find(e => e.name === n) || {}) })}</p></button>
        ) : (
          <div key={n} className="card tcard edit"><div className="row between"><b>{n}</b><span className="tg b">편집 중</span></div>
            {house ? <>{F('at', '시점', '개월 후')}{F('price', '주택 가격', '만 원')}{F('lump', '계약금', '만 원')}<Row l="주택담보대출">{comma(loan)}만 원 · {ed.years || 30}년 원리금균등</Row>{F('years', '상환 기간', '년')}<Row l="대출 금리"><b>{rate}%</b> <small>시장 환경 연동</small></Row><Row l="월 상환액 (자동 계산)"><b className="nv">약 {Math.round(monthly)}만 원</b></Row></>
              : <>{F('at', '시점', '개월 후')}{F('lump', '목돈 지출', '만 원')}{F('living', '생활비 변화', '만 원/월')}{F('incomePct', '소득 변화', '%')}{F('incomeMonths', '소득 변화 기간', '개월')}{n === '이직' && F('afterPct', '이후 소득 변화', '%')}</>}
          </div>
        ))}
        <p className="muted">이벤트 1개 = 목돈 지출 + 생활비 변화 + 소득 변화 + 대출 상환 변화의 묶음</p>
      </section>
      <Foot>{!atOk && <p className="err center">시점은 1 이상의 정수여야 합니다.</p>}<button className="btn" disabled={!atOk} onClick={add}>이 고객에게 추가</button></Foot>
    </>
  );
}

/* ①-6 목표 우선순위 */
const BADGE = ['#0f9478', '#1e3aaf', '#7c5cc9'];
export function Goals({ client: c, upd, go, st }) {
  const goals = [{ name: c.goalName, amount: c.goalAmount, date: c.goalDate }, ...(c.goalList || []).slice(1)]; // 1순위는 메인 목표와 한 데이터
  const [open, setOpen] = useState(null), [drag, setDrag] = useState(null);
  const set = g => {
    const f = g[0], mm = f && /^\d{4}-\d{2}$/.test(f.date || '') ? monthsBetween({ ...c, goalDate: f.date }) : null;
    upd({ goalList: g, goalName: f.name, goalAmount: f.amount, goalDate: f.date, ...(mm ? { months: mm } : {}) }); // 1순위 목표가 본 시뮬레이션의 목표
  };
  const mo = g => { const [y, m] = g.date.split('-').map(Number); return (y - c.startYear) * 12 + (m - c.startMonth) + 1; };
  const ends = goals.map(mo), bad = ends.some(e => !(e >= 1 && e <= 60)), N = Math.min(60, Math.max(...ends, 1));
  const mar = (c.events || []).find(e => e.name === '결혼');
  const sh = mar ? [{ type: 'event', at: mar.at, living: mar.living }] : [];
  const simG = (gs, p) => simulate({ client: { ...c, months: N }, plan: p, market: toMarket(st.market), shocks: sh, months: N, startMonth: c.startMonth, opts: { goals: gs.map(g => ({ name: g.name, amount: g.amount, end: Math.max(1, Math.min(60, mo(g))) })) } });
  const res = bad ? null : simG(goals, c.planB);
  const cur0 = c.goalDeposit + (c.planB.realloc?.invToGoal || 0);
  const need = goals.map((g, i) => { const left = ends[i] - (i === 0 ? 0 : ends[i - 1]); return left > 0 ? Math.max(0, (g.amount - (i === 0 ? cur0 : 0)) / left) : 0; });
  const age = c.age || 30, rt = retirement({ ...c, age }, st.market, c.planB.alloc[3], c.planA.alloc[3], c.months);
  let hypo = null;
  if (!bad && goals.length > 1) {
    const li = goals.length - 1, d = new Date(goals[li].date + '-01'); d.setMonth(d.getMonth() - 12);
    const nd = d.toISOString().slice(0, 7);
    if (mo({ date: nd }) > ends[li - 1]) { const r2 = simG(goals.map((g, i) => (i === li ? { ...g, date: nd } : g)), c.planB); if (res.goalPcts[li] - r2.goalPcts[li] >= 5) hypo = [goals[li].name, nd.replace('-', '.'), res.goalPcts[li], r2.goalPcts[li]]; }
  }
  const move = (i, d) => { const g = [...goals]; [g[i], g[i + d]] = [g[i + d], g[i]]; set(g); };
  const drop = to => { if (drag == null || drag === to) return; const g = [...goals]; const [x] = g.splice(drag, 1); g.splice(to, 0, x); set(g); setDrag(null); };
  const upG = (i, p) => set(goals.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <>
      <Head back={() => go('info')} backLabel="고객 정보" title="목표 우선순위" sub="끌어서 순서를 바꾸면 배분이 다시 계산됩니다" step={1} demo />
      <section className="pad">
        {goals.map((g, i) => (
          <div key={i} className="gcard" draggable onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => drop(i)}>
            <div className="gb"><i style={{ background: BADGE[i] || '#5b6483' }}>{i + 1}</i><span className="hd" title="끌어서 순서 변경">≡</span>
              <span className="arr"><button disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">▲</button><button disabled={i === goals.length - 1} onClick={() => move(i, 1)} aria-label="아래로">▼</button></span></div>
            <div className="gm">
              <button className="gtog" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} aria-label={`${g.name} 편집`}><b>{g.name}</b><span className="muted">{comma(g.amount)}만 원</span></button>
              <p className="muted">{g.date.replace('-', '.')} · {i === 0 ? `정기예금 · 지금 ${comma(cur0)}` : `${goals[0].name} 후 적립 시작`}</p>
              {res && <><div className="pbar"><i style={{ width: `${Math.min(100, res.goalPcts[i])}%`, background: BADGE[i] || '#5b6483' }} /></div>
                <p>예상 <b>{fmt(res.goalPcts[i])}%</b> · {i > 0 ? `${goals[0].name} 후 적립 · ` : ''}필요 월 {fmt(need[i])}만 원</p></>}
              {!(ends[i] >= 1 && ends[i] <= 60) && <p className="err">시점은 1~60개월 사이로 입력해 주세요</p>}
              {open === i && <div className="gedit" onClick={e => e.stopPropagation()}><div className="grid2"><Field label="이름"><input value={g.name} onChange={e => upG(i, { name: e.target.value })} /></Field><Field label="금액(만원)"><NumIn value={g.amount} onChange={v => upG(i, { amount: v })} /></Field></div><Field label="시점"><input type="month" value={g.date} onChange={e => upG(i, { date: e.target.value })} /></Field>{goals.length > 1 && <button className="lnk" onClick={() => { set(goals.filter((_, j) => j !== i)); setOpen(null); }}>이 목표 삭제</button>}</div>}
            </div>
          </div>
        ))}
        <div className="gcard"><div className="gb"><i style={{ background: '#7c5cc9' }}>{goals.length + 1}</i></div><div className="gm"><div className="row between"><b>노후</b><span className="muted">연금저축</span></div><p className="muted">60세 · 별도 계좌</p><p>60세 예상 <b>{won(rt.fv)}</b> · 입주 후 {c.planA.alloc[3]}% 복귀</p></div></div>
        <div className="card sm2"><b>배분 규칙</b> 목표 예금 몫은 1순위에 먼저 넣고, 1순위 기한이 끝나면 2순위로 넘어갑니다. 노후는 연금 계좌로 따로 적립됩니다. 1순위 목표가 본 시뮬레이션의 목표로 쓰입니다.</div>
        {hypo && <div className="note2 amber"><b>충돌 알림</b> {hypo[0]}를 {hypo[1]}로 앞당기면 달성률이 {fmt(hypo[2])}% → {fmt(hypo[3])}%로 떨어집니다.</div>}
      </section>
      <Foot><button className="btn" disabled={bad} onClick={() => go('info')}>저장하고 다음</button><button className="link" onClick={() => set([...goals, { name: '새 목표', amount: 1000, date: '2030-12' }])}>+ 목표 추가</button></Foot>
    </>
  );
}

/* ①-7 가구 단위 */
export function House({ client: c, upd, go, st }) {
  const sp = c.spouse || { income: 280, emergency: 500, goalDeposit: 1000, living: 400 };
  const [mode, setMode] = useState(c.household === false ? 0 : 1);
  const set = (k, v) => upd({ spouse: { ...sp, [k]: v } });
  const cc = { ...c, spouse: sp }, stop = [{ type: 'stop', at: 10, len: 3 }];
  const r = (p, hh) => simulate({ client: cc, plan: p, market: toMarket(st.market), shocks: stop, months: c.months, startMonth: c.startMonth, opts: { household: hh } });
  const spBad = ['income', 'emergency', 'goalDeposit', 'living'].some(k => sp[k] === '' || sp[k] == null || +sp[k] < 0) || !(+sp.living > 0);
  const [Bi, Bh, Ai, Ah] = [r(c.planB, false), r(c.planB, true), r(c.planA, false), r(c.planA, true)];
  const bz = x => (x.bottom ? `${x.bottom}개월째` : '없음');
  return (
    <>
      <Head back={() => go('info')} backLabel="고객 정보" title="가구 단위 설계" sub={`${c.name} + 예비 배우자 · ${c.goalDate.replace('-', '.')} 결혼 예정`} step={1} demo />
      <section className="pad">
        <Seg items={[`${c.name} 개인`, '가구 합산']} value={mode} onChange={setMode} />
        <div className="card"><p className="ttl">배우자 정보 · 만 원</p>
          <Row l="세후 월 소득 (고정형)"><label className="inl"><NumIn value={sp.income} onChange={v => set('income', v)} /></label></Row>
          <Row l="비상자금 · 목표 예금"><label className="inl two"><NumIn value={sp.emergency} onChange={v => set('emergency', v)} /><span>·</span><NumIn value={sp.goalDeposit} onChange={v => set('goalDeposit', v)} /></label></Row>
          <Row l="공동 생활비 (월)"><label className="inl"><NumIn value={sp.living} onChange={v => set('living', v)} /></label></Row></div>
        <div className="card"><p className="ttl">소득 정지 3개월 ({c.name}만) · B안</p>
          <table className="cmp"><thead><tr><th /><th className={mode === 0 ? 'on' : ''}>개인</th><th className={mode === 1 ? 'on' : ''}>가구</th></tr></thead><tbody>
            <tr><td>비상자금 바닥</td><td>{bz(Bi)}</td><td>{bz(Bh)}</td></tr>
            <tr><td>최저 비상자금</td><td>{fmt(Bi.minMonths, 1)}개월</td><td className="okc">{fmt(Bh.minMonths, 1)}개월</td></tr>
            <tr><td>{c.goalName} 달성률</td><td>{fmt(Bi.goalPct)}%</td><td className="okc">{fmt(Bh.goalPct)}%</td></tr>
            <tr><td>A안 바닥 시점</td><td className={Ai.bottom ? 'err' : ''}>{bz(Ai)}</td><td>{bz(Ah)}</td></tr></tbody></table></div>
        <Note label="읽는 법">가구로 보면 B안은 {c.goalName}이 남습니다. 연금 비중을 입주 전부터 {c.planA.alloc[3]}%로 되돌릴 여지가 생깁니다.</Note>
        <Note label="A안은?" tone="amber">가구 기준에서도 A안은 최저 {fmt(Ah.minMonths, 1)}개월로 목표 {c.emergencyMonths}개월에 못 미쳐 최고 경보가 '{Ah.grade}'입니다{Ah.overLimit ? `. 손실 체감 ${fmt(Ah.loss)}만 원으로 한도(${c.psychLimit}만 원)도 넘습니다` : Ah.bottom ? '' : '. 바닥은 없지만 안전하다는 뜻은 아닙니다'}.</Note>
        <p className="muted center">배우자 정보는 배우자 본인 동의 후 입력합니다</p>
      </section>
      <Foot>{spBad && <p className="err center">배우자 정보를 모두 입력하고, 공동 생활비는 0보다 커야 합니다.</p>}<button className="btn" disabled={spBad} onClick={() => { upd({ household: mode === 1, spouse: sp }); go('scen'); }}>{mode === 1 ? '가구' : '개인'} 기준으로 시뮬레이션</button></Foot>
    </>
  );
}

/* ②-2 AI 답변 비교 점검 */
export function AiCompare({ client: c, upd, updWork, go, st }) {
  const [ans, setAns] = useState(c.aiAnswers || [{ name: 'AI 가', alloc: [...c.planA.alloc], credit: '' }, { name: 'AI 나', alloc: [20, 30, 30, 20], credit: 175 }]);
  const [sel, setSel] = useState(Math.max(0, ans.findIndex(a => a.name === c.aiChosen)));
  const save = a => { setAns(a); upd({ aiAnswers: a }); };
  const setA = (k, p) => save(ans.map((x, j) => (j === k ? { ...x, ...p } : x)));
  const apply = () => {
    const a = ans[sel], same = JSON.stringify(a.alloc) === JSON.stringify(c.planA.alloc);
    upd({ planA: { ...c.planA, alloc: a.alloc, aiCredit: a.credit }, aiChosen: a.name }); if (!same) updWork({ judge: {} }); go('plan');
  };
  const sum = a => a.alloc.reduce((x, y) => x + (+y || 0), 0);
  return (
    <>
      <Head back={() => go('plan')} backLabel="배분안" title="AI 답변 비교 점검" sub="같은 질문을 두 AI에 넣은 결과입니다" step={2} demo />
      <section className="pad">
        {ans.map((a, k) => {
          const checks = checkPlan(c, { alloc: a.alloc, aiCredit: a.credit }, st.market), f = checks.filter(r => r.flag);
          return (
            <div key={k} className={`aicard ${sel === k ? 'sel' : ''}`}>
              <div className="row between"><b>{a.name} 답변</b><Badge tone={f.length ? 'amber' : 'green'}>{f.length ? `주의 ${f.length}건` : '통과'}</Badge></div>
              <div className="tiles">{['비상', '목표', '투자', '연금'].map((l, i) => <label key={l} className="tile"><span>{l}</span><div><NumIn value={a.alloc[i]} onChange={v => setA(k, { alloc: a.alloc.map((y, z) => (z === i ? v : y)) })} />%</div></label>)}</div>
              {sum(a) !== 100 && <p className="err">합계 {sum(a)}% (100%가 되어야 합니다)</p>}
              {f.map(r => <div key={r.id} className="wr"><b><i className="wi">⚠</i> {r.label}</b><p>{r.detail}</p></div>)}
              <div className="wr ok2"><b>✓ 나머지 규칙 {checks.length - f.length}개 통과</b></div>
              <label className="aicr">AI가 말한 세액공제액 (선택)<NumIn value={a.credit} onChange={v => setA(k, { credit: v })} /></label>
              <button className={`btn ${sel === k ? 'purple' : 'ghost2'}`} disabled={sum(a) !== 100} onClick={() => setSel(k)}>{sel === k ? '✓ A안으로 선택됨' : '이 답변을 A안으로'}</button>
            </div>
          );
        })}
        <p className="muted center">두 답변의 점검 결과는 리포트에 기록됩니다</p>
      </section>
      <Foot><button className="btn" disabled={sum(ans[sel]) !== 100} onClick={apply}>선택한 답변으로 계속</button></Foot>
    </>
  );
}

/* ②-3 상품·세제 */
export function Prod({ client: c, go, st }) {
  const [A, B] = [c.planA, c.planB].map(p => products(c, st.market, p));
  const stopA = run(c, null, c.planA, [{ type: 'stop', at: 10, len: 3 }], st.market);
  const rows = [['파킹통장', '비상자금 · 예금자보호', 'parking'], ['정기예금', `${c.goalName} · 예금자보호`, 'deposit'], ['ISA', '국내 주식형 ETF · 2등급', 'isa'], ['연금저축', '세액공제 · 55세 이후', 'pension']];
  const diff = Math.round(A.credit) - Math.round(B.credit);
  return (
    <>
      <Head back={() => go('plan')} backLabel="배분안" title="상품·세제 비교" sub="연간 납입 계획 기준 · 만 원" step={2} demo />
      <section className="pad">
        <div className="card"><div className="tr head3"><span /><span className="pillA">A안</span><span className="pillB">B안</span></div>
          {rows.map(([t, s, k]) => <div className="tr prow" key={k}><div><b>{t}</b><small>{s}</small></div><b>{comma(A[k])}</b><b>{comma(B[k])}</b></div>)}</div>
        <div className="card"><p className="ttl">세제 혜택 (연)</p>
          <div className="tr prow"><div>연금저축 세액공제 <small>16.5%</small></div><b>{Math.round(A.credit)}</b><b>{Math.round(B.credit)}</b></div>
          <div className="tr prow"><div>ISA 비과세 한도</div><b>{A.isa > 0 ? '200 이내' : '해당 없음'}</b><b>{B.isa > 0 ? '200 이내' : '해당 없음'}</b></div>
          <div className="tr prow"><div>예금 이자 과세 <small>15.4%</small></div><b>일반</b><b>일반</b></div></div>
        <Note label="읽는 법">{diff > 0 ? `A안이 세액공제는 연 ${diff}만 원 많지만` : '세액공제 차이는 작지만'}, 소득 정지 때 {stopA.forced > 0 ? `투자자산 ${fmt(stopA.forced)}만 원을 하락 구간에 팔아야 합니다.` : '강제 매도는 생기지 않습니다.'}</Note>
        <p className="muted center">ISA 한도는 현행 연 2,000만 원 기준 · 2027 개편안은 국회 통과 전제<br />세액공제율은 종합소득금액 4,500만 원 이하 가정</p>
      </section>
      <Foot><button className="btn" onClick={() => go('plan')}>배분안으로 돌아가기</button></Foot>
    </>
  );
}

/* ②-4 받을 수 있는 제도 */
const SCHEMES = [
  { id: 'umbrella', name: '노란우산공제', tag: '추천', tone: 'green', desc: '사업소득금액 4천만 원 이하면 연 최대 600만 원 소득공제. 폐업·질병 때 생활안정 자금', link: '소득 정지 대비' },
  { id: 'youth', name: '청년미래적금', tag: '조건 확인', tone: 'amber', desc: '만 19~34세, 월 최대 50만 원, 3년. 정부기여금 6%(우대형 12%). 종합소득·연매출 요건과 신청 기간 확인 필요' },
  { id: 'isa27', name: 'ISA 청년 소득공제', tag: '2027 개편안', tone: 'gray', desc: "15~34세 ISA 납입액의 10% 소득공제 추진. 국회 통과 전제라 제안서에는 '예정'으로만 표기" },
];
export function Schemes({ client: c, updWork, go, st }) {
  const sel = c.work.schemes || [];
  const tog = id => updWork({ schemes: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] });
  return (
    <>
      <Head back={() => go('plan')} backLabel="배분안" title="받을 수 있는 제도" sub={`${c.name} · ${c.age || 30}세 · ${c.type === 'variable' ? '프리랜서(사업소득)' : '직장인(근로소득)'} · 무주택`} step={2} demo />
      <section className="pad">
        {SCHEMES.map(s => (
          <button key={s.id} className={`card scheme ${sel.includes(s.id) ? 'on' : ''}`} onClick={() => tog(s.id)} aria-pressed={sel.includes(s.id)}>
            <div className="row between"><b>{s.name}</b><Badge tone={s.tone}>{s.tag}</Badge></div>
            <p className="muted">{s.desc}{s.link && <> → <b>{s.link}</b>와 연결</>}</p>{sel.includes(s.id) && <small className="nv">✓ 제안서에 포함</small>}</button>
        ))}
        <div className="note2 purple"><b>AI 추천 초안</b> 고객 조건으로 찾은 후보입니다. 자격과 금액은 공식 안내로 확인한 뒤 제안하세요.</div>
        <p className="muted center">제도 정보 기준일 {st.market.asOf.replace(/-/g, '.')}</p>
      </section>
      <Foot><button className="btn" onClick={() => go('plan')}>제안서에 포함할 제도 선택{sel.length ? ` (${sel.length}개)` : ''}</button></Foot>
    </>
  );
}

/* ④-2 안전선 찾기 */
export function Safety({ client: c, go, st }) {
  const sh = shocksOf(c, st.market), has = sh.length > 0;
  const s = useMemo(() => (has ? safetyLine(c, st.market, sh) : null), [c, st.market]);
  const title = Object.entries(c.work.shocks).filter(([t]) => shockOk(c, t)).map(([t, p]) => (t === 'event' ? `생애 이벤트(${evName(p)})` : SCENARIOS[t].name)).join(' + ') || '충격 없음';
  const M = ({ n, t, sub, v }) => <div className="card meth"><small>방법 {n}</small><div className="row between"><div><b>{t}</b><p className="muted">{sub}</p></div><span className="mv2">{v == null ? '찾지 못함' : v}</span></div></div>;
  return (
    <>
      <Head back={() => go('result')} backLabel="결과 비교" title="안전선 찾기" sub={`${title} · A안 기준`} step={4} demo />
      <section className="pad">
        {!has ? <p className="warn">③에서 충격을 하나 이상 고르면 계산할 수 있습니다.</p> : <>
          <div className="note2 purple"><b>질문</b> 이 시나리오에서 비상자금이 바닥나지 않으려면 무엇이 최소 얼마 필요한가요?</div>
          <M n={1} t="월 비상자금 비중" sub={`${c.planA.alloc[0]}%에서 올리고 그만큼 투자 비중을 줄일 때`} v={s.m1 == null ? null : `${s.m1}% 이상`} />
          <M n={2} t="투자자산 → 비상자금" sub="월 배분은 그대로 두고 한 번만 옮길 때" v={s.m2 == null ? null : `${comma(s.m2)}만 원 이상`} />
          <M n={3} t="소득보상 보험" sub={`3개월 보장 기준 · 지금 보장 ${c.insurance.monthly}만 원`} v={s.m3 == null ? null : `월 ${s.m3}만 원 이상`} />
          <Note label="읽는 법">비율을 바꾸는 것보다 쌓인 자산을 옮기는 쪽이 효과가 큽니다. 보험은 투자 비중을 유지하고 싶은 고객의 대안입니다. 반영은 플래너가 정합니다.</Note>
          <p className="muted center">50만 원 · 5%p · 10만 원 단위 탐색</p></>}
      </section>
      <Foot><button className="btn" onClick={() => go('plan')}>B안 수정하러 가기</button><button className="link" onClick={() => go('result')}>결과 비교로 돌아가기</button></Foot>
    </>
  );
}

/* ④-3 고객 대면 모드 */
export function Face({ client: c, go, st }) {
  const [len, setLen] = useState(3), [kind, setKind] = useState(0);
  const cases = [
    { n: '만약 일을 못 하게 된다면?', sh: [{ type: 'stop', at: 10, len }], next: '큰돈이 나간다면' },
    { n: '만약 큰돈이 갑자기 나간다면?', sh: [{ type: 'lump', at: 4, amount: 500 }], next: '투자가 떨어진다면' },
    { n: '만약 투자가 크게 떨어진다면?', sh: [toShock('crash', { at: 6, preset: '2022형' }, st.market)], next: '일을 못 하게 된다면' },
  ];
  const cs = cases[kind];
  const [A, B] = [c.planA, c.planB].map(p => run(c, null, p, cs.sh, st.market));
  const head = (r, good) => (r.bottom ? `${r.bottom}개월째에\n통장이 바닥나요` : good ? '끝까지 버틸 수 있어요' : '끝까지 버텨요');
  const sub = (r, isB) => r.forced > 0 ? <>주식 <b className="red">{fmt(r.forced)}만 원</b>을 손해 보며 팔아야 해요</> : r.crashLoss > 0 ? <>투자자산이 <b className="red">{fmt(r.crashLoss)}만 원</b> 줄어요</> : <>{c.goalName}도 <b className={isB ? 'grn' : ''}>{fmt(r.goalPct)}%</b>까지 모여요</>;
  const H = (r, good) => head(r, good).split('\n').map((x, i) => <React.Fragment key={i}>{i > 0 && <br />}{x}</React.Fragment>);
  return (
    <div className="face">
      <Status demo />
      <div className="row between"><button className="back" onClick={() => go('result')}>‹ 플래너 화면</button><span className="hr">고객과 함께 보기</span></div>
      <h1>{cs.n}</h1>
      {kind === 0 && <div className="fcard dark"><div className="row between"><span>일을 쉬는 기간</span><b className="big2">{len}개월</b></div><input type="range" min="1" max="12" value={len} onChange={e => setLen(+e.target.value)} aria-label="일을 쉬는 기간" /><div className="row between"><small>1개월</small><small>12개월</small></div></div>}
      <div className="fcard"><small className="pl">지금 계획대로라면</small><h2>{H(A, false)}</h2><p>{sub(A, false)}</p></div>
      <div className="fcard rec"><small className="gl">추천 계획이라면</small><h2>{H(B, true)}</h2><p>{sub(B, true)}</p></div>
      <p className="fnote">숫자는 지금 소득과 지출을 그대로 둔 계산입니다</p>
      <div className="ffoot"><button className="btn light" onClick={() => setKind((kind + 1) % 3)}>다른 경우 보기 · {cs.next}</button></div>
    </div>
  );
}

/* ④-4 노후 장기 전망 */
export function Retire({ client: c, go, st }) {
  const age = c.age || 30, m = st.market, a = c.planA.alloc[3], b = c.planB.alloc[3];
  const cc = { ...c, age };
  const R = [retirement(cc, m, a, a), retirement(cc, m, b, a, c.months), retirement(cc, m, b, b)];
  const W = 340, H = 170, L = 36, B = 22, max = 5000 * Math.max(3, Math.ceil(R[0].fv / 5000)), yrs = 60 - age;
  const x = i => L + (i * (W - L - 6)) / yrs, y = v => 8 + (H - B - 8) * (1 - v / max);
  const path = s => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, 1, 2, 3, 4, 5].map(k => k * 5000).filter(v => v <= max), ages = [age, age + 9, age + 18, age + 27, 60].filter((v, i, arr) => v <= 60 && arr.indexOf(v) === i);
  const r10 = v => comma(Math.round(v / 10) * 10);
  return (
    <>
      <Head back={() => go('result')} backLabel="결과 비교" title="노후 장기 전망" sub="60세 연금저축 적립액 · 만 원" step={4} demo />
      <section className="pad">
        <div className="card"><div className="row between"><p className="ttl">연령별 적립액</p><span className="legend"><i style={{ background: '#7c5cc9' }} />A <i style={{ background: '#0f9478' }} />B 복귀 <i style={{ background: '#b9bfd6' }} />B 유지</span></div>
          <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="연령별 연금저축 적립액">
            {ticks.map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 4} y={y(v) + 3} textAnchor="end">{v === 0 ? '0' : `${v / 10000}억`}</text></g>)}
            {ages.map(g => <text key={g} x={x(g - age)} y={H - 6} textAnchor="middle">{g}세</text>)}
            <path d={path(R[2].series)} fill="none" stroke="#b9bfd6" strokeWidth="2.4" strokeDasharray="5 4" /><path d={path(R[1].series)} fill="none" stroke="#0f9478" strokeWidth="2.6" /><path d={path(R[0].series)} fill="none" stroke="#7c5cc9" strokeWidth="2.6" /></svg></div>
        <div className="card"><div className="tr head3 r3"><span /><span>60세 적립액</span><span>현재가치</span></div>
          {[[`A안 · 계속 ${a}%`, R[0]], [`B안 · 입주 후 ${a}% 복귀`, R[1]], [`B안 · ${b}% 유지`, R[2]]].map(([l, r]) => <div className="tr r3" key={l}><span>{l}</span><b>{comma(r.fv)}</b><span className="muted">{comma(r.pv)}</span></div>)}</div>
        <Note label="읽는 법">입주 후 연금 비중을 {a}%로 되돌리면 A안과의 60세 차이는 <b>약 {r10(R[0].fv - R[1].fv)}만 원</b>(현재가치 약 {r10(R[0].pv - R[1].pv)}만 원)입니다. {b}%를 유지하면 차이가 약 {r10(R[0].fv - R[2].fv)}만 원으로 커집니다.</Note>
        <div className="card"><p className="ttl">입주 후 투자 복귀 로드맵 · B안</p>
          {[['단기', `~ ${c.goalDate.replace('-', '.')} 입주`, `비상자금·${c.goalName} 우선. 투자 ${c.planB.alloc[2]}%, 연금 ${b}% 유지`],
            ['중기', '입주 후 1~2년', `비상자금 목표 ${c.emergencyMonths}개월을 채운 뒤 연금 ${a}%로 복귀`],
            ['장기', '그 이후', `투자는 ${c.grade} 허용 한도(${PROFILE_MAX[c.grade]}%) 안에서 단계적으로 복귀`]].map(([t, w, d]) => <div className="kv" key={t}><div><span><b>{t}</b></span><small>{w}</small></div><div className="v">{d}</div></div>)}</div>
        <p className="muted center">소득·지출 현재 수준 유지 기준, 연 {m.pension.value}% 복리, 물가 {m.cpi.value}% 반영<br />시뮬레이션 기간 밖의 장기 전망입니다</p>
      </section>
      <Foot><button className="btn" onClick={() => go('result')}>결과 비교로 돌아가기</button></Foot>
    </>
  );
}

/* ④-5 확률 시뮬레이션 */
function Bands({ res, target, c }) {
  const W = 340, H = 150, L = 34, n = res[0].band.length;
  const max = Math.max(target, ...res.flatMap(r => r.band.map(b => b[2]))) * 1.05 || 1, top = Math.ceil(max / 500) * 500;
  const x = i => L + (i * (W - L - 4)) / Math.max(1, n - 1), y = v => 6 + (H - 24) * (1 - v / top);
  const area = band => band.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b[2])}`).join('') + band.map((b, i) => `L${x(n - 1 - i)},${y(band[n - 1 - i][0])}`).join('') + 'Z';
  const mid = band => band.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b[1])}`).join('');
  const ticks = [0, 500, 1000, 1500, 2000, 2500].filter(v => v <= top), col = ['#7c5cc9', '#0f9478'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="비상자금 범위">
      {ticks.map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 4} y={y(v) + 3} textAnchor="end">{v}</text></g>)}
      {res.map((r, k) => <g key={k}><path d={area(r.band)} fill={col[k]} opacity=".14" /><path d={mid(r.band)} fill="none" stroke={col[k]} strokeWidth="2.6" /></g>)}
      <text x={W - 2} y={y(res[1].band[n - 1][1]) - 6} textAnchor="end" fill={col[1]}>B 중앙값</text><text x={W - 2} y={y(res[0].band[n - 1][1]) - 6} textAnchor="end" fill={col[0]}>A 중앙값</text>
      <text x={L} y={H - 4}>{calLabel(c, 1).slice(2)}</text><text x={x((n - 1) / 2)} y={H - 4} textAnchor="middle">{calLabel(c, Math.round((n + 1) / 2)).slice(2)}</text><text x={W - 4} y={H - 4} textAnchor="end">{calLabel(c, n).slice(2)}</text>
    </svg>
  );
}
export function Prob({ client: c, go, st }) {
  const [res, setRes] = useState(null);
  useEffect(() => { setRes(null); const t = setTimeout(() => setRes(monteCarlo({ client: c, plans: [c.planA, c.planB], market: toMarket(st.market), months: c.months, startMonth: c.startMonth })), 30); return () => clearTimeout(t); }, [c.planA, c.planB, c.id, st.market]);
  const Q = (title, k) => (
    <div className="pq" key={k}><b>{title}</b>{[0, 1].map(i => <div className="prow2" key={i}><span className={i ? 'pillB' : 'pillA'}>{'AB'[i]}</span><div className="pb"><i style={{ width: `${Math.max(res[i][k] > 0 ? 1 : 0, res[i][k])}%`, background: i ? '#0f9478' : '#7c5cc9' }} /></div><b>{fmt(res[i][k], 1)}%</b></div>)}</div>
  );
  return (
    <>
      <Head back={() => go('result')} backLabel="결과 비교" title="확률 시뮬레이션" sub={`5,000개 경로 · ${c.name} · ${c.months}개월`} step={4} />
      <section className="pad">
        {!res ? <div className="card"><p className="muted center">5,000개 경로를 계산하는 중…</p></div> : <>
          <div className="card">{Q('비상자금이 바닥나지 않을 확률', 'noBottom')}{Q(`${c.goalName} 80% 이상 모일 확률`, 'g80')}{Q(`손실 한도(${c.psychLimit}) 넘을 확률`, 'over')}</div>
          <div className="card"><p className="ttl">비상자금 범위 · 하위 10% ~ 상위 10%</p><Bands res={res} target={c.living * c.emergencyMonths} c={c} /></div>
          <div className="card sm2"><b>산출 조건</b> 충격 없이 소득·투자수익만 흔들 때 · 월 소득 변동 표준편차 30% · 매달 1% 확률로 3개월 소득 공백 · 투자 연 {st.market.invest.value}%, 변동성 18% · 예금 {st.market.deposit.value}%</div>
          <p className="muted center">중앙 달성률 A {fmt(res[0].medianGoal)}% · B {fmt(res[1].medianGoal)}% · 확률은 조건에 따라 달라집니다</p></>}
      </section>
      <Foot><button className="btn" onClick={() => go('result')}>결과 비교로 돌아가기</button></Foot>
    </>
  );
}

/* ⑤ 설명·확인 기록 */
const RISKS = [['원금 손실 가능성', 'ETF 등 투자상품은 원금이 보장되지 않음'], ['시나리오의 한계', '고정 조건 기반이며 실제와 다를 수 있음'], ['세제 혜택 조건', '연금저축 중도 해지 시 공제액 추징'], ['AI 활용 사실', 'AI 초안을 플래너가 검증·수정함']];
export function Record({ client: c, updWork, upd, go, st }) {
  const ch = c.pick || c.adopted;
  const { work: _w, history: _h, status: _s, pick: _p, recheckInfo: _r, survey: _sv, consent: _c, aiAnswers: _a, ...inputs } = c;
  const sig = JSON.stringify([inputs, c.work.shocks, ch, st.market]); // 계산에 쓰는 입력이 하나라도 바뀌면 이전 확인은 무효
  const fresh = { risks: [], confirm: false, note: '', noteOn: false };
  const r = c.work.record && c.work.record.sig === sig ? c.work.record : fresh; // 안이나 시나리오가 바뀌면 이전 설명·확인은 무효
  const set = p => updWork({ record: { ...r, ...p, sig } });
  const plan = ch === 'A' ? c.planA : c.planB, maxInv = PROFILE_MAX[c.grade], over = plan.alloc[2] > maxInv;
  const ok = r.risks.length === RISKS.length && !!r.confirm && (!r.noteOn || r.note.trim());
  const now = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const save = () => {
    const rec = { ...r, at: r.confirmAt || now(), atISO: st.market.asOf, sig };
    updWork({ record: rec, review: null });
    if (st.settings?.review) { go('review'); return; } // 선임 승인 전에는 채택 완료로 바꾸지 않는다
    commitAdopt(c, st, upd, rec); go('report');
  };
  const Chk = ({ on, onClick, t, d }) => <button className="chrow" onClick={onClick} aria-pressed={on}><i className={`cb ${on ? 'on' : ''}`} /><div><b>{t}</b>{d && <p>{d}</p>}</div></button>;
  return (
    <>
      <Head back={() => go('result')} backLabel="결과 비교" title="설명·확인 기록" sub="채택 전 고객에게 설명한 내용을 남깁니다" step={5} />
      <section className="pad">
        <div className="card"><p className="ttl">적합성 확인</p><Row l="투자성향"><b>{c.grade}</b></Row><Row l={`${ch}안 고위험 비중`}><b className={over ? 'err' : 'ok'}>{plan.alloc[2]}% · {over ? '부적합' : '적합'}</b></Row>
          {over && <p className="err">부적합 안입니다. 고객 확인서를 따로 받거나 안을 수정하세요</p>}</div>
        <div className="card"><p className="ttl">설명한 위험</p>{RISKS.map(([t, d]) => <Chk key={t} t={t} d={d} on={r.risks.includes(t)} onClick={() => set({ risks: r.risks.includes(t) ? r.risks.filter(y => y !== t) : [...r.risks, t] })} />)}</div>
        <div className="card"><p className="ttl">고객 확인</p>
          <Chk t="설명을 듣고 이해함" d={r.confirm ? `고객 확인 · ${r.confirmAt || ''}` : '체크하면 확인 시각이 기록됩니다'} on={!!r.confirm} onClick={() => set(r.confirm ? { confirm: false, confirmAt: null } : { confirm: true, confirmAt: now() })} />
          <Chk t="고객 질문 메모" d="선택 · 있으면 체크하고 적어 주세요" on={!!r.noteOn} onClick={() => set({ noteOn: !r.noteOn })} />
          {r.noteOn && <textarea rows={2} value={r.note} onChange={e => set({ note: e.target.value })} placeholder="예: 소득 정지 보험도 알아보고 싶어요" aria-label="고객 질문 메모" />}</div>
        <p className="muted center">금융소비자보호법상 적합성 확인·설명 의무 이행 기록</p>
      </section>
      <Foot><button className="btn" disabled={!ok} onClick={save}>기록 저장하고 리포트 보기</button></Foot>
    </>
  );
}

/* ⑤-1 선임 검토 */
export function Review({ client: c, upd, updWork, go, st }) {
  const [op, setOp] = useState(c.work.review?.opinion || '');
  const ch = c.pick || c.adopted, plan = ch === 'A' ? c.planA : c.planB, flagged = checkPlan(c, c.planA, st.market).filter(r => r.flag), maxInv = PROFILE_MAX[c.grade];
  const { work: _w, history: _h, status: _s, pick: _p, recheckInfo: _r, survey: _sv, consent: _c, aiAnswers: _a, ...inputs } = c;
  const sigNow = JSON.stringify([inputs, c.work.shocks, ch, st.market]);
  const fixed = flagged.filter(r => c.work.judge[r.id] === 'fix').length, rec = c.work.record, recOk = !!rec && rec.sig === sigNow && rec.risks?.length === RISKS.length && !!rec.confirm;
  const checks = [
    ['AI 점검 항목 모두 판정', `${flagged.length}건 · ${fixed === flagged.length ? '모두 수정 반영' : `수정 반영 ${fixed}건`}`, flagged.every(r => c.work.judge[r.id])],
    ['시나리오 3개 이상 확인', '6개 · 스트레스 매트릭스', true],
    ['적합성 통과', `${c.grade} · 고위험 ${plan.alloc[2]}%`, plan.alloc[2] <= maxInv],
    ['설명·확인 기록 완료', recOk ? `필수 ${RISKS.length + 1}개 · 고객 확인 ${(rec?.confirmAt || '').slice(-5)}` : '입력이 바뀌어 다시 확인이 필요합니다', recOk],
  ];
  return (
    <>
      <Head back={() => go('record')} backLabel="설명·확인 기록" title="선임 검토" sub="조직에서 쓸 때만 켜지는 단계입니다" step={5} demo />
      <section className="pad">
        <div className="card row between"><div><small className="muted">검토 요청 · {(rec?.at || '').slice(5, 16) || '-'}</small><h3 className="rq">{c.name} · {ch}안 채택</h3></div><Badge tone="amber">검토 대기</Badge></div>
        <div className="card"><p className="ttl">검토 체크리스트 · 앱이 자동 확인</p>{checks.map(([t, d, ok]) => <div className="chrow static" key={t}><i className={`cb ${ok ? 'on' : 'off'}`} /><div><b>{t}</b><p>{d}</p></div></div>)}</div>
        <div className="card"><p className="ttl">선임 의견</p><textarea rows={3} value={op} onChange={e => setOp(e.target.value)} placeholder="수정 요청 시 필수" aria-label="선임 의견" /></div>
      </section>
      <Foot><div className="row two"><button className="btn ghost" disabled={!op.trim()} onClick={() => { updWork({ review: { rejected: true, opinion: op } }); go('result'); }}>수정 요청</button>
        <button className="btn" disabled={!checks.every(x => x[2])} onClick={() => { updWork({ review: { approvedAt: new Date().toLocaleString('ko-KR'), role: '선임 설계사' } }); commitAdopt(c, st, upd, rec); go('report'); }}>승인</button></div></Foot>
    </>
  );
}

/* ⑤-3 고객용 제안서 */
export function Proposal({ client: c, go, st }) {
  const plan = adoptedPlan(c), len = 3, sAt = Math.max(1, Math.min(10, c.months - 2)), stress = run(c, null, plan, [{ type: 'stop', at: sAt, len }], st.market), base = run(c, null, plan, [], st.market);
  const target = c.living * c.emergencyMonths, now0 = c.emergency / c.living, gp = Math.round(stress.goalPct); // 달성률과 금액은 같은 반올림 값(gp)에서 계산
  const reach = base.emgArr.findIndex(v => v >= target) + 1, mo = reach > 0 ? reach : null;
  const after = mo ? `약 ${mo >= 12 ? `${Math.floor(mo / 12)}년 ${mo % 12 ? `${mo % 12}개월 ` : ''}` : `${mo}개월 `}뒤 ${c.emergencyMonths}개월` : `${c.emergencyMonths}개월을 향해 쌓는 중`;
  const re = plan.realloc || {}, picks = (c.work.schemes || []).map(id => ({ youth: '청년미래적금', umbrella: '노란우산공제', isa27: 'ISA 청년 소득공제(예정)' })[id]);
  const cc = { ...c, age: c.age || 30 }, gap = retirement(cc, st.market, c.planA.alloc[3], c.planA.alloc[3]).fv - retirement(cc, st.market, plan.alloc[3], c.planA.alloc[3], c.months).fv;
  const share = async () => { const t = `${c.name} 님 재무 제안서 요약: 일이 ${len}개월 끊겨도 ${c.goalName} ${gp}% 확보`; try { if (navigator.share) await navigator.share({ title: '재무 제안서', text: t }); else { await navigator.clipboard?.writeText(t); alert('요약 문구를 복사했습니다. 카카오톡에 붙여넣어 보내세요.'); } } catch {} };
  return (
    <>
      <header className="head plain"><Status demo />
        <div className="row between"><button className="back" onClick={() => go('report')}>‹ 검증 리포트</button><button className="lnk big" onClick={() => window.print()}>PDF · 링크 공유</button></div></header>
      <section className="pad prop">
        <p className="sub">{st.market.asOf.replace(/-/g, '.')} 재무 제안서</p>
        <h1 className="ptitle">{c.name} 님,<br />일이 {len}개월 끊겨도<br />{stress.bottom ? <>{stress.bottom}개월째에 보완이 필요해요</> : '버틸 수 있는 계획이에요'}</h1>
        {[['#0f9478', `비상금을 ${c.emergencyMonths}개월치까지`, `지금 ${fmt(now0, 1)}개월 → ${after}`], ['#1e3aaf', `${c.goalName} ${gp}% 이상 확보`, `일이 끊겨도 ${comma(Math.round(c.goalAmount * gp / 1000) * 10)}만 원 이상`], ['#7c5cc9', '노후 준비는 입주 후 다시 늘리기', `60세 차이 약 ${comma(Math.round(gap / 10) * 10)}만 원`]].map(([col, t, d], i) => (
          <div className="pcard" key={i}><i style={{ background: col }}>{i + 1}</i><div><b>{t}</b><p>{d}</p></div></div>))}
        <div className="card"><p className="ttl dk">이번 달 할 일</p>
          {re.invToEmerg > 0 && <p className="td">✓ 투자 계좌에서 <b>{comma(re.invToEmerg)}만 원</b> → 비상금 통장</p>}
          {re.invToGoal > 0 && <p className="td">✓ 투자 계좌에서 <b>{comma(re.invToGoal)}만 원</b> → {c.goalName} 예금</p>}
          <p className="td">✓ 매달 남는 돈 {plan.alloc[0] === 50 ? '절반' : plan.alloc[0] === 100 ? '전부' : `${plan.alloc[0]}%`}은 비상금 통장으로</p>
          {picks.length > 0 && <p className="td">✓ 확인해 볼 제도: {picks.join(', ')}</p>}</div>
        <p className="muted">가정: 지금부터 {sAt}개월 후 시작, {len}개월 소득 정지 기준 · 시장 기준일 {st.market.asOf.replace(/-/g, '.')}</p>
        <p className="muted">이 제안은 현재 소득·지출과 기대수익률에 따른 계산이며 미래 결과를 보장하지 않습니다. 투자상품은 원금 손실이 생길 수 있습니다.</p>
      </section>
      <Foot><div className="row two"><button className="btn ghost" onClick={() => window.print()}>PDF 저장</button><button className="btn" onClick={share}>카카오톡 공유</button></div></Foot>
    </>
  );
}

/* ⑥ 모니터링 */
export function Monitor({ client: c, upd, go, st }) {
  const [el, setEl] = useState(8), [inc, setInc] = useState([120, 100, 110]), [emg, setEmg] = useState(880), [invNow, setInvNow] = useState(''), [goalNow, setGoalNow] = useState(''), [inc2, setInc2] = useState(100);
  const plan = adoptedPlan(c), base = run(c, null, plan, [], st.market), n = base.emgArr.length;
  const e = Math.min(Math.max(3, el), n), living = c.living, T = c.emergencyMonths;
  const pl = [0, 1, 2].reduce((s, k) => { const i = e - 3 + k, cal = ((c.startMonth - 1 + i) % 12) + 1; return s + (c.type === 'fixed' ? c.income : c.incomeByMonth[cal]); }, 0);
  const act = inc.reduce((a, b) => a + (+b || 0), 0), dec = pl ? 1 - act / pl : 0, em = emg / living;
  const lv = alertLevel(dec, em, T), COL = ['#0f9478', '#e0a800', '#e8851a', '#d93636'][lv];
  const W = 340, H = 150, L = 34, max = Math.max(living * T, emg, ...base.emgArr) * 1.1;
  const x = i => L + (i * (W - L - 6)) / Math.max(1, n - 1), y = v => 6 + (H - 26) * (1 - v / max);
  const prev = base.emgArr[Math.max(0, e - 4)];
  const actual = base.emgArr.slice(0, e).map((v, i) => (i < e - 3 ? v : prev + ((emg - prev) * (i - (e - 4))) / 3));
  const warnLine = living * (T * 2 / 3);
  const revalidate = () => {
    const [sy, sm] = calLabel(c, e + 1).split('.').map(Number), strip = p => ({ ...p, realloc: undefined }); // 이번 달 말 잔액이므로 다음 달부터, 이미 실행된 재배치는 빼고 남은 기간으로 다시 시작
    const f = inc2 / 100, scale = f === 1 ? {} : c.type === 'fixed' ? { income: Math.round((+c.income || 0) * f) } : { incomeByMonth: Object.fromEntries(Object.entries(c.incomeByMonth || {}).map(([k, v]) => [k, Math.round((+v || 0) * f)])) };
    upd({ emergency: emg, invest: invNow === '' ? c.invest : invNow, goalDeposit: goalNow === '' ? c.goalDeposit : goalNow, ...scale, startYear: sy, startMonth: sm, months: Math.max(1, c.months - e), planA: strip(c.planA), planB: strip(c.planB), status: 'recheck', recheckInfo: { dec, el: e, at: st.market.asOf }, work: { ...c.work, shocks: {} } });
    go('scen');
  };
  const ticks = [0, 500, 1000, 1500, 2000].filter(v => v <= max);
  return (
    <>
      <Head back={() => go('report')} backLabel="검증 리포트" title={`모니터링 · ${c.name}`} sub={<><b className="amb">실행 {e}개월째</b> · {c.adopted || 'B'}안 · {calLabel(c, e)}</>} step={6} demo="예시 시점" />
      <section className="pad">
        <div className={`mon l${lv}`}><div><small>현재 경보</small><h2><i style={{ background: COL }} />{lv ? GRADES[lv] : '정상'}</h2></div>{lv > 0 && <span className="rcb">재검증 필요</span>}</div>
        <div className="two2"><div className="card sm3"><small>3개월 소득</small><b style={{ color: COL }}>{dec > 0 ? '−' : '+'}{Math.abs(Math.round(dec * 100))}%</b><span className="muted">실제 {comma(act)} / 계획 {comma(pl)}</span></div>
          <div className="card sm3"><small>비상자금</small><b style={{ color: COL }}>{fmt(em, 1)}개월</b><span className="muted">{comma(emg)}만 원 / 목표 {T}개월</span></div></div>
        <div className="card"><div className="row between"><p className="ttl">비상자금 · 계획 대비 실제</p><span className="legend"><i className="dash" />계획 <i style={{ background: '#1a2238' }} />실제</span></div>
          <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="계획 대비 실제 비상자금">
            {ticks.map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 4} y={y(v) + 3} textAnchor="end">{v}</text></g>)}
            <line x1={L} x2={W} y1={y(warnLine)} y2={y(warnLine)} stroke="#e8851a" strokeDasharray="4 3" /><text x={W - 2} y={y(warnLine) + 11} textAnchor="end" fill="#e8851a">경고선 {fmt(T * 2 / 3, 0)}개월</text>
            <path d={base.emgArr.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} fill="none" stroke="#0f9478" strokeWidth="2.4" strokeDasharray="5 4" />
            <path d={actual.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} fill="none" stroke="#1a2238" strokeWidth="2.6" /><circle cx={x(e - 1)} cy={y(emg)} r="5" fill={COL} />
            <text x={L} y={H - 5}>{calLabel(c, 1).slice(2)}</text><text x={x(e - 1)} y={H - 5} textAnchor="middle">{calLabel(c, e).slice(2)} 현재</text><text x={W - 4} y={H - 5} textAnchor="end">{calLabel(c, n).slice(2)}</text></svg></div>
        <div className="card"><p className="ttl">이번 달 입력 · {calLabel(c, e)}</p>
          <div className="grid2"><Field label="실제 소득"><Sfx value={inc[2]} onChange={v => setInc([inc[0], inc[1], v])}>만 원</Sfx></Field><Field label="비상자금 잔액"><Sfx value={emg} onChange={v => setEmg(v === '' ? 0 : v)}>만 원</Sfx></Field></div>
          <details><summary className="muted">이전 두 달 소득·현재 자산·향후 소득 전망</summary><div className="grid2"><Field label="현재 투자자산 (비우면 기존 값)"><NumIn value={invNow} onChange={setInvNow} /></Field><Field label="현재 목표 예금 (비우면 기존 값)"><NumIn value={goalNow} onChange={setGoalNow} /></Field></div><Field label="향후 소득 전망 (계획 대비 %)"><NumIn value={inc2} onChange={v => setInc2(v === '' ? 100 : v)} /></Field><div className="grid3"><Field label="2개월 전"><NumIn value={inc[0]} onChange={v => setInc([v, inc[1], inc[2]])} /></Field><Field label="1개월 전"><NumIn value={inc[1]} onChange={v => setInc([inc[0], v, inc[2]])} /></Field><Field label="경과(개월)"><NumIn value={el} onChange={v => setEl(v === '' ? 3 : v)} /></Field></div></details></div>
        <div className="card sm2"><b>재검증 주기</b> 분기(3개월)마다 정기 점검 · 금리 0.25%p·물가 0.5%p 변동, 코스피 고점 대비 −20% 이하일 때는 즉시</div>
        <div className="card"><p className="ttl">고객 안내 문구</p><p>{lv > 0 ? `최근 3개월 소득이 계획보다 ${Math.abs(Math.round(dec * 100))}% ${dec > 0 ? '줄었습니다' : '늘었습니다'}. 재량지출을 줄이고 비상자금 이체를 먼저 챙겨 주세요.` : '계획대로 진행 중입니다. 다음 점검까지 지금 방식을 유지해 주세요.'}</p></div>
      </section>
      <Foot><button className="btn" onClick={revalidate}>현재 잔액으로 재검증</button></Foot>
    </>
  );
}

/* ⑤-4 제안 이력 */
export function commitAdopt(c, st, upd, rec) {
  const h = c.history || [], re = c.status === 'recheck';
  const note = re ? '재검증 채택' : h.length ? '재채택' : '최초 제안';
  const v = re ? `v${Math.floor(h.length ? parseFloat(String(h[h.length - 1].v).replace('v', '')) : 1) + 1}` : h.length ? `v1.${h.length}` : 'v1';
  const ch = c.pick || c.adopted;
  upd({ status: 'adopted', adopted: ch, pick: null, history: [...h, snapshot({ ...c, adopted: ch }, st.market, v, note, { record: rec, memo: c.work.memo, judge: c.work.judge })] });
}
export const pick = r => ({ min: r.minMonths, goal: r.goalPct, grade: r.grade });
export const snapshot = (c, m, v, note, extra = {}) => ({ ...extra, v, note, date: m.asOf, adopted: c.adopted, planA: c.planA, planB: c.planB, n: checkPlan(c, c.planA, m).filter(r => r.flag).length, mA: pick(summary(c, m, c.planA)), mB: pick(summary(c, m, c.planB)) });
export function History({ client: c, upd, go, st }) {
  const h = c.history || [], [a, setA] = useState(0), [b, setB] = useState(Math.max(0, h.length - 1)), [text, setText] = useState('');
  useEffect(() => { setA(0); setB(Math.max(0, h.length - 1)); }, [h.length]);
  const supplement = () => { const last = h[h.length - 1], [mj, mn = '0'] = String(last.v).replace('v', '').split('.'); upd({ history: [...h, snapshot(c, st.market, `v${mj}.${+mn + 1}`, text.trim() || '보완')] }); setText(''); };
  const A = h[Math.min(a, h.length - 1)], B = h[Math.min(b, h.length - 1)], d = x => x.date.replace(/-/g, '.');
  const desc = (x, i) => i === 0 ? `AI 원안 점검 ${x.n}건 → ${x.adopted}안 채택 · 설명 기록${c.work.review?.approvedAt ? ' · 선임 승인' : ''}` : x.note === '재검증 채택' && c.recheckInfo ? `3개월 소득 ${c.recheckInfo.dec > 0 ? '−' : '+'}${Math.abs(Math.round(c.recheckInfo.dec * 100))}% 경고 → 비상자금 비중 ${h[i - 1].planB.alloc[0]} → ${x.planB.alloc[0]}% 수정안` : x.note;
  return (
    <>
      <Head back={() => go('report')} backLabel="검증 리포트" title={`제안 이력 · ${c.name}`} sub="버전마다 리포트와 설명 기록이 함께 저장됩니다" step={6} demo />
      <section className="pad">
        {h.length === 0 && <p className="card muted center">아직 채택 기록이 없습니다.</p>}
        {h.length > 0 && <div className="card tline">{h.map((x, i) => <div className="tv" key={i}><i style={{ background: x.note === '재검증 채택' ? '#e8851a' : '#0f9478' }} /><div className="row between"><b>{x.v} {x.note === '재검증 채택' ? `재검증${c.recheckInfo ? ` · ${c.recheckInfo.el}개월째` : ''}` : i === 0 ? '최초 제안' : '보완'}</b><span className="muted">{d(x)}</span></div><p className="muted">{desc(x, i)}</p></div>)}</div>}
        {h.length > 0 && <div className="card"><Field label="보완 내용"><input value={text} onChange={e => setText(e.target.value)} placeholder="예: 소득보상 보험 검토 의견 추가" /></Field><button className="btn ghost" onClick={supplement}>보완 버전 저장</button></div>}
        {h.length > 1 && <div className="card"><div className="row between"><p className="ttl">버전 비교 · {A.v} → {B.v}</p><span className="row tight"><select className="sel" value={a} onChange={e => setA(+e.target.value)} aria-label="비교 기준 버전">{h.map((x, i) => <option key={i} value={i}>{x.v}</option>)}</select><select className="sel" value={b} onChange={e => setB(+e.target.value)} aria-label="비교 대상 버전">{h.map((x, i) => <option key={i} value={i}>{x.v}</option>)}</select></span></div>
          <table className="cmp"><thead><tr><th /><th>{A.v}</th><th>{B.v}</th></tr></thead><tbody>
            {[['비상자금 비중', 0], ['목표 예금 비중', 1], ['투자 비중', 2], ['연금저축 비중', 3]].map(([l, i]) => <tr key={l}><td>{l}</td><td>{A.planB.alloc[i]}%</td><td className={A.planB.alloc[i] !== B.planB.alloc[i] ? 'nv' : ''}>{B.planB.alloc[i]}%</td></tr>)}
            <tr><td>B 최저 비상자금</td><td>{fmt(A.mB.min, 1)}개월</td><td>{fmt(B.mB.min, 1)}개월</td></tr>
            <tr><td>근거</td><td>{A.note}</td><td>{B.note === '재검증 채택' ? '모니터링 경고' : B.note}</td></tr></tbody></table></div>}
      </section>
      <Foot><button className="btn" onClick={() => go('report')}>최신 리포트 보기</button><button className="link" onClick={() => window.print()}>버전 비교 이미지 저장 (인쇄)</button></Foot>
    </>
  );
}
