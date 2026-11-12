import React, { useMemo, useState } from 'react';
import { Head, Field, NumIn, fmt, LABEL, shocksOf, summary } from './ui.jsx';
import { checkPlan, monthsBetween, annualPlus, SCENARIOS, toShock, run, toMarket, safetyLine, products, retirement, TEMPLATES, mortgage, alertLevel, PROFILE_MAX, GRADE_LIST } from './rules.js';
import { simulate, monteCarlo, GRADES } from './engine.js';

const adoptedPlan = c => (c.adopted === 'A' ? c.planA : c.planB);
const shockNames = c => Object.entries(c.work.shocks).map(([t, p]) => p.name || SCENARIOS[t].name).join(' + ') || '충격 없음';
const Demo = () => <span className="demo">시연 화면</span>;

/* ①-A 개인정보 동의 (고객 화면) */
export function Consent({ client: c, upd, go }) {
  const [ch, setCh] = useState({ req: false, ai: false, spouse: false });
  return (
    <>
      <header className="head"><p className="muted">상담 준비 · 고객 화면</p><h1>{c.name} 님, 상담 전 동의가 필요해요</h1></header>
      <section className="pad">
        <div className="card"><label className="check"><input type="checkbox" checked={ch.req} onChange={e => setCh({ ...ch, req: e.target.checked })} /><span><b>[필수]</b> 개인정보 수집·이용<br /><span className="muted">목적: 재무설계 상담 · 항목: 소득, 지출, 자산, 부채, 보험, 목표 · 보유 기간: 상담 종료 후 1년 (시연 문구, 실제 서비스는 법률 검토 필요)</span></span></label>
          <label className="check"><input type="checkbox" checked={ch.ai} onChange={e => setCh({ ...ch, ai: e.target.checked })} /><span><b>[선택]</b> 서류 자동 분석(AI 처리) 고지와 동의</span></label>
          <label className="check"><input type="checkbox" checked={ch.spouse} onChange={e => setCh({ ...ch, spouse: e.target.checked })} /><span><b>[선택]</b> 배우자 정보 입력<br /><span className="muted">배우자 본인 동의가 따로 필요합니다</span></span></label></div>
        <button className="btn" disabled={!ch.req} onClick={() => { upd({ consent: { at: new Date().toLocaleString('ko-KR'), items: ch } }); go('survey'); }}>동의하고 시작하기</button>
        <button className="link" onClick={() => go('home')}>나중에 할게요</button>
      </section>
    </>
  );
}

/* ①-B 사전 설문 (고객 화면) */
const QS = [
  { k: 'type', q: '소득이 매달 비슷한가요?', ch: [['fixed', '매달 비슷해요'], ['variable', '달마다 달라요']] },
  { k: 'lowest', q: '가장 적게 번 달의 소득은? (만원)', num: true },
  { k: 'living', q: '매달 꼭 나가는 고정 지출은? (만원)', num: true },
  { k: 'emergency', q: '비상용으로 둔 돈은? (만원)', num: true },
  { k: 'invest', q: '투자 중인 자산은? (만원)', num: true },
  { k: 'goalDeposit', q: '목표를 위해 모아 둔 예금은? (만원)', num: true },
  { k: 'loanPay', q: '매달 갚는 대출 원리금은? (만원)', num: true },
  { k: 'loanBal', q: '대출 잔액은? (만원)', num: true },
  { k: 'insurance', q: '소득을 보장해 주는 보험 월 금액은? (만원)', num: true },
  { k: 'goalAmount', q: '이루고 싶은 목표 금액은? (만원)', num: true },
  { k: 'grade', q: '투자에서 손실이 나면 어떻게 하시나요?', ch: [['안정형', '바로 팔아요'], ['안정추구형', '많이 불안해요'], ['위험중립형', '조금 지켜봐요'], ['적극투자형', '더 사요'], ['공격투자형', '크게 베팅해요']] },
];
export function Survey({ client: c, upd, go }) {
  const [i, setI] = useState(0), [a, setA] = useState(c.survey || {});
  const q = QS[i], v = a[q.k];
  const ok = v !== undefined && v !== '';
  const left = Math.max(1, Math.ceil(((QS.length - i) * 20) / 60));
  const send = () => { upd({ survey: a, surveyAt: new Date().toLocaleString('ko-KR'), surveyApplied: false }); go('home'); };
  return (
    <>
      <header className="head"><p className="muted">사전 설문 · 남은 시간 약 {left}분</p><div className="bar"><i style={{ width: `${((i + 1) / QS.length) * 100}%` }} /></div><h1>{q.q}</h1><p className="muted">{i + 1} / {QS.length}</p></header>
      <section className="pad">
        {q.ch ? q.ch.map(([k, l]) => <button key={k} className={`chip big ${v === k ? 'on' : ''}`} onClick={() => setA({ ...a, [q.k]: k })}>{l}</button>)
          : <NumIn value={v ?? ''} onChange={x => setA({ ...a, [q.k]: x })} autoFocus />}
        <div className="row two">
          <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>이전</button>
          {i < QS.length - 1 ? <button className="btn" disabled={!ok} onClick={() => setI(i + 1)}>다음</button> : <button className="btn" disabled={!ok} onClick={send}>설계사에게 보내기</button>}
        </div>
        <button className="link" onClick={() => { if (confirm('동의를 철회하면 입력한 정보가 삭제됩니다.')) { upd({ consent: null, survey: null }); go('home'); } }}>동의 철회</button>
      </section>
    </>
  );
}
export function applySurvey(c) {
  const s = c.survey, p = { surveyApplied: true };
  if (s.type) { p.type = s.type; p.taxShare = s.type === 'fixed' ? 0 : c.taxShare || 0.15; p.emergencyMonths = s.type === 'fixed' ? 3 : 6; }
  ['living', 'emergency', 'invest', 'goalDeposit', 'loanPay', 'loanBal', 'goalAmount'].forEach(k => { if (s[k] !== undefined) p[k] = s[k]; });
  if (s.insurance !== undefined) p.insurance = { ...c.insurance, monthly: s.insurance };
  if (s.grade) p.grade = s.grade;
  return p;
}

/* ①-5 생애 이벤트 + ①-5b 템플릿 */
export function Events({ client: c, updWork, go, st }) {
  const [name, setName] = useState('결혼'), [p, setP] = useState({ ...TEMPLATES['결혼'] }), [msg, setMsg] = useState('');
  const pick = n => { setName(n); setP({ ...TEMPLATES[n] }); setMsg(''); };
  const house = name === '주택 구입';
  const monthly = house ? mortgage(p.loan, st.market.loan.value, p.years) : 0;
  const send = () => {
    const sh = c.work.shocks;
    if (p.at > c.months) return setMsg(`기간(${c.months}개월) 밖 이벤트입니다. 시점을 기간 안으로 줄이면 시나리오로 보낼 수 있고, 지금은 노후 전망에만 반영됩니다.`);
    if (!sh.event && Object.keys(sh).length >= 2) return setMsg('최대 2개까지 선택할 수 있습니다. ③에서 하나를 해제하세요.');
    const { note, loan, years, ...rest } = p;
    updWork({ shocks: { ...sh, event: { ...rest, name, loanAdd: house ? monthly : 0 } } });
    go('scen');
  };
  const F = (k, l) => <Field label={l}><NumIn value={p[k] ?? 0} onChange={v => setP({ ...p, [k]: v })} /></Field>;
  return (
    <>
      <Head back={() => go('info')} title="생애 이벤트" sub="템플릿을 고르면 현금흐름 변화로 바꿔 줍니다 (기본값은 팀 가정)" step={1} />
      <section className="pad">
        <div className="chips">{Object.keys(TEMPLATES).map(n => <button key={n} className={`chip ${name === n ? 'on' : ''}`} onClick={() => pick(n)}>{n}</button>)}</div>
        <div className="card">
          {F('at', '시점 (개월 후)')}{F('lump', '목돈 지출 (만원)')}{F('living', '생활비 변화 (월, 만원)')}{F('incomePct', '소득 변화 (%)')}{F('incomeMonths', '소득 변화 기간 (개월)')}
          {house && <>{F('loan', '대출 원금 (만원)')}{F('years', '상환 기간 (년)')}<p className="ok">월 상환 약 {fmt(monthly, 1)}만원 ({st.market.loan.value}%, 원리금균등)</p></>}
          {TEMPLATES[name].note && <p className="muted">{TEMPLATES[name].note}</p>}
        </div>
        <p className="muted">타임라인: 지금 → 목표 {c.months}개월 → 이후. {p.at <= c.months ? '이 이벤트는 기간 안이라 시뮬레이션에 반영됩니다.' : '기간 밖 이벤트는 노후 전망에 반영 표시만 합니다.'}</p>
        {msg && <p className="err">{msg}</p>}
        <button className="btn" onClick={send}>시나리오로 바로 보내기</button>
      </section>
    </>
  );
}

/* ①-6 목표 우선순위 */
export function Goals({ client: c, upd, go, st }) {
  const goals = c.goalList || [{ name: c.goalName, amount: c.goalAmount, date: c.goalDate }];
  const [marry, setMarry] = useState(true);
  const set = g => upd({ goalList: g });
  const mo = g => (() => { const [y, m] = g.date.split('-').map(Number); return (y - c.startYear) * 12 + (m - c.startMonth); })();
  const ends = goals.map(mo), N = Math.min(60, Math.max(...ends, 1));
  const bad = ends.some(e => e < 1 || e > 60);
  const move = (i, d) => { const g = [...goals]; [g[i], g[i + d]] = [g[i + d], g[i]]; set(g); };
  const gl = goals.map((g, i) => ({ name: g.name, amount: g.amount, end: Math.max(1, Math.min(60, ends[i])) }));
  const sh = marry ? [{ type: 'event', at: 18, living: 40 }] : [];
  const res = bad ? null : [c.planA, c.planB].map(p => simulate({ client: { ...c, months: N }, plan: p, market: toMarket(st.market), shocks: sh, months: N, startMonth: c.startMonth, opts: { goals: gl } }));
  const cur0 = c.goalDeposit + (c.planB.realloc?.invToGoal || 0);
  const need = goals.map((g, i) => { const from = i === 0 ? 0 : ends[i - 1], left = ends[i] - from; return left > 0 ? Math.max(0, (g.amount - (i === 0 ? cur0 : 0)) / left) : 0; });
  return (
    <>
      <Head back={() => go('info')} title="목표 우선순위" sub="목표 예금 몫은 1순위에 먼저 넣고, 기한이 끝나면 다음 순위로 넘어갑니다" step={1} />
      <section className="pad">
        {goals.map((g, i) => (
          <div className="card" key={i}>
            <div className="row between"><b>{i + 1}순위</b><span><button className="chip" disabled={i === 0} onClick={() => move(i, -1)}>↑</button> <button className="chip" disabled={i === goals.length - 1} onClick={() => move(i, 1)}>↓</button></span></div>
            <div className="grid2">
              <Field label="이름"><input value={g.name} onChange={e => set(goals.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
              <Field label="금액(만원)"><NumIn value={g.amount} onChange={v => set(goals.map((x, j) => (j === i ? { ...x, amount: v } : x)))} /></Field>
            </div>
            <Field label="시점" err={ends[i] < 1 || ends[i] > 60 ? '1~60개월 사이로 입력해 주세요' : ''}><input type="month" value={g.date} onChange={e => set(goals.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></Field>
            <p className="muted">필요 월 적립액 {fmt(need[i])}만원 (이자 제외 단순 계산)</p>
            {res && <p>예상 달성률 A <b>{fmt(res[0].goalPcts[i])}%</b> · B <b>{fmt(res[1].goalPcts[i])}%</b>{res[1].goalPcts[i] < 50 && <span className="err"> · 앞 순위와 충돌: 부족합니다</span>}</p>}
          </div>
        ))}
        <button className="dashed" onClick={() => set([...goals, { name: '새 목표', amount: 1000, date: '2029-12' }])}>+ 목표 추가</button>
        <label className="check"><input type="checkbox" checked={marry} onChange={e => setMarry(e.target.checked)} />결혼 후 생활비 +40 반영 (18개월 후)</label>
        <p className="muted">시뮬레이션 {N}개월 · 노후는 연금 계좌로 따로 관리합니다.</p>
      </section>
    </>
  );
}

/* ①-7 가구 단위 */
export function House({ client: c, upd, go, st }) {
  const sp = c.spouse || { income: 280, emergency: 500, goalDeposit: 1000, living: 400 };
  const [on, setOn] = useState(true);
  const set = (k, v) => upd({ spouse: { ...sp, [k]: v } });
  const cc = { ...c, spouse: sp }, sh = shocksOf(c, st.market);
  const r = (p, hh) => simulate({ client: cc, plan: p, market: toMarket(st.market), shocks: sh, months: c.months, startMonth: c.startMonth, opts: { household: hh } });
  const rows = [['개인', false], ['가구 합산', true]];
  return (
    <>
      <Head back={() => go('info')} title="가구 단위 설계" sub="배우자 본인 동의 후 입력 · 충격은 고객 본인 소득에만 적용" step={1} />
      <section className="pad">
        <div className="card grid2">
          <Field label="배우자 세후 소득"><NumIn value={sp.income} onChange={v => set('income', v)} /></Field>
          <Field label="배우자 비상자금"><NumIn value={sp.emergency} onChange={v => set('emergency', v)} /></Field>
          <Field label="배우자 목표 예금"><NumIn value={sp.goalDeposit} onChange={v => set('goalDeposit', v)} /></Field>
          <Field label="공동 생활비(월)"><NumIn value={sp.living} onChange={v => set('living', v)} /></Field>
        </div>
        <p className="label">{shockNames(c)} · 개인 / 가구 합산 비교</p>
        <div className="card"><table className="cmp sm"><thead><tr><th /><th>A 최저</th><th>A 달성</th><th>B 최저</th><th>B 달성</th></tr></thead>
          <tbody>{rows.map(([l, hh]) => { const a = r(c.planA, hh), b = r(c.planB, hh); return <tr key={l} className={on || !hh ? '' : 'dim'}><td>{l}</td><td>{fmt(a.minMonths, 1)}개월</td><td>{fmt(a.goalPct)}%</td><td>{fmt(b.minMonths, 1)}개월</td><td>{fmt(b.goalPct)}%</td></tr>; })}</tbody></table></div>
        <p className="muted">가구로 보면 B안은 입주자금이 남아, 연금 비중을 입주 전부터 되돌릴 여지가 생깁니다. 결론이 바뀔 수 있다는 점이 가구 단위 설계가 필요한 이유입니다.</p>
      </section>
    </>
  );
}

/* ②-2 AI 답변 비교 점검 */
export function AiCompare({ client: c, upd, updWork, go, st }) {
  const [ans, setAns] = useState(c.aiAnswers || [{ name: 'AI 가', alloc: [...c.planA.alloc], credit: '' }, { name: 'AI 나', alloc: [10, 20, 50, 20], credit: 175 }]);
  const save = a => { setAns(a); upd({ aiAnswers: a }); };
  return (
    <>
      <Head back={() => go('plan')} title="AI 답변 비교 점검" sub="같은 질문을 두 AI에 넣어 받은 답변을 각각 점검하고 하나를 A안으로 고릅니다" step={2} />
      <section className="pad">
        {ans.map((a, k) => {
          const flags = checkPlan(c, { alloc: a.alloc, aiCredit: a.credit }, st.market);
          const f = flags.filter(r => r.flag), sum = a.alloc.reduce((x, y) => x + (+y || 0), 0);
          return (
            <div className="card" key={k}>
              <b>{a.name}</b>
              <div className="grid2">{LABEL.map((l, i) => <Field key={l} label={`${l} %`}><NumIn value={a.alloc[i]} onChange={v => save(ans.map((x, j) => (j === k ? { ...x, alloc: x.alloc.map((y, z) => (z === i ? v : y)) } : x)))} /></Field>)}</div>
              <Field label="AI가 말한 세액공제액 (만원)"><NumIn value={a.credit} onChange={v => save(ans.map((x, j) => (j === k ? { ...x, credit: v } : x)))} /></Field>
              <p className={f.length ? 'err' : 'ok'}>주의 {f.length}건{f.length ? `: ${f.map(r => r.label).join(', ')}` : ''}</p>
              {f.map(r => <p key={r.id} className="muted">{r.label}: {r.detail}</p>)}
              <button className="btn ghost" disabled={sum !== 100} onClick={() => { upd({ planA: { ...c.planA, alloc: a.alloc, aiCredit: a.credit }, aiChosen: a.name }); updWork({ judge: {} }); go('plan'); }}>이 답변을 A안으로{sum !== 100 ? ' (합계 100% 필요)' : ''}</button>
            </div>
          );
        })}
        <p className="muted">두 답변의 점검 결과는 리포트에 기록됩니다{c.aiChosen ? ` · 선택: ${c.aiChosen}` : ''}.</p>
      </section>
    </>
  );
}

/* ②-3 상품·세제 */
export function Prod({ client: c, go, st }) {
  const [A, B] = [c.planA, c.planB].map(p => products(c, st.market, p));
  const rows = [['비상자금 → 파킹통장', 'parking'], ['목표 예금 → 정기예금', 'deposit'], ['투자 → ISA(국내 주식형 ETF)', 'isa'], ['연금 → 연금저축', 'pension'], ['연금저축 세액공제(16.5%)', 'credit']];
  return (
    <>
      <Head back={() => go('plan')} title="상품·세제 비교" sub={<>연간 납입(만원) = 가용액이 플러스인 달의 합 {fmt(annualPlus(c, st.market), 1)} × 비중 <Demo /></>} step={2} />
      <section className="pad">
        <div className="card"><table className="cmp"><thead><tr><th /><th><span className="pillA">A안</span></th><th><span className="pillB">B안</span></th></tr></thead>
          <tbody>{rows.map(([l, k]) => <tr key={k}><td>{l}</td><td>{fmt(A[k])}</td><td>{fmt(B[k])}</td></tr>)}</tbody></table></div>
        <p className="muted">ISA 한도는 현행 기준(연 2,000)입니다. 2027 개편안(연 합계 4,000)은 국회 통과 전제로만 표시합니다. 공제율·한도는 제출 전 재확인이 필요합니다.</p>
      </section>
    </>
  );
}

/* ②-4 받을 수 있는 제도 */
const SCHEMES = [
  { id: 'youth', name: '청년미래적금', tag: '조건 확인', desc: '만 19~34세, 월 50 한도, 3년, 정부기여 6%(우대 12%). 소득 요건·신청 기간 확인 필요', link: '시나리오와의 연결: 목표 예금 보강' },
  { id: 'umbrella', name: '노란우산공제', tag: '추천', desc: '사업소득금액 4,000 이하 최대 600 소득공제 (2026 연말정산 기준)', link: '시나리오와의 연결: 변동형 소득의 세금 부담 완화' },
  { id: 'isa27', name: 'ISA 2027 개편안', tag: '개편안', desc: '생산적금융 ISA 신설, 연 합계 4,000. 국회 통과 전제', link: '시나리오와의 연결: 투자 비중 세제' },
];
export function Schemes({ client: c, updWork, go }) {
  const sel = c.work.schemes || [];
  const tog = id => updWork({ schemes: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] });
  return (
    <>
      <Head back={() => go('plan')} title="받을 수 있는 제도" sub={<>AI 추천 초안 · 설계사가 고른 제도만 고객용 제안서에 들어갑니다 <Demo /></>} step={2} />
      <section className="pad">
        {SCHEMES.map(s => (
          <label key={s.id} className="card check col"><div className="row"><input type="checkbox" checked={sel.includes(s.id)} onChange={() => tog(s.id)} /><b>{s.name}</b><span className={`tag ${s.tag === '추천' ? 'rec' : ''}`}>{s.tag}</span></div><span className="muted">{s.desc}</span><span className="muted">{s.link}</span></label>
        ))}
        <p className="muted">제도 목록은 기준일이 있는 고정 표입니다(2026.11 기준).</p>
      </section>
    </>
  );
}

/* ④-2 안전선 찾기 */
export function Safety({ client: c, go, st }) {
  const sh = shocksOf(c, st.market), has = sh.length > 0;
  const s = useMemo(() => (has ? safetyLine(c, st.market, sh) : null), [c, st.market]);
  const f = v => (v == null ? '찾지 못함' : v);
  return (
    <>
      <Head back={() => go('result')} title="안전선 찾기" sub={<>{shockNames(c)} · A안 기준 <Demo /></>} step={4} />
      <section className="pad">
        {!has ? <p className="warn">③에서 충격을 하나 이상 고르면 계산할 수 있습니다.</p> : <>
          <p className="muted">비상자금 바닥이 사라지는 첫 값입니다.</p>
          <div className="card"><div className="row between"><span>방법 1 · 비상자금 비중 (5%p씩↑, 투자↓)</span><b>{s.m1 == null ? '-' : `${s.m1}%`}</b></div></div>
          <div className="card"><div className="row between"><span>방법 2 · 투자 → 비상자금 재배치 (50만원씩↑)</span><b>{s.m2 == null ? '-' : `${s.m2}만원`}</b></div></div>
          <div className="card"><div className="row between"><span>방법 3 · 소득보상 보험 (10만원씩↑, 3개월 보장)</span><b>{s.m3 == null ? '-' : `월 ${s.m3}만원`}</b></div></div>
          {f(s.m1) === '찾지 못함' && s.m2 == null && s.m3 == null && <p className="muted">이 충격은 세 방법 모두로 바닥을 없애지 못했습니다.</p>}
        </>}
        <button className="btn" onClick={() => go('plan')}>B안 수정하러 가기</button>
        <p className="muted">값은 자동 입력되지 않습니다. 반영은 플래너가 결정합니다.</p>
      </section>
    </>
  );
}

/* ④-3 고객 대면 모드 */
export function Face({ client: c, go, st }) {
  const [len, setLen] = useState(3), [kind, setKind] = useState(0);
  const cases = [
    { n: '일을 쉬게 되면?', sh: [{ type: 'stop', at: 10, len }] },
    { n: '큰돈이 갑자기 나가면?', sh: [{ type: 'lump', at: 4, amount: 500 }] },
    { n: '투자가 크게 떨어지면?', sh: [toShock('crash', { at: 6, preset: '2022형' }, st.market)] },
  ];
  const cs = cases[kind];
  const [A, B] = [c.planA, c.planB].map(p => run(c, null, p, cs.sh, st.market));
  const line = (name, r) => r.forced > 0 ? `${name}: 손해 보며 팔아야 해요 (${fmt(r.forced)}만원)` : r.bottom ? `${name}: 바닥나요` : `${name}: 버틸 수 있어요 · ${fmt(r.goalPct)}%까지 모여요`;
  return (
    <section className="face">
      <button className="back" onClick={() => go('result')}>‹ 뒤로</button>
      <h1>{cs.n}</h1>
      {kind === 0 && <><p className="big">{len}개월 쉬어요</p><input type="range" min="1" max="12" value={len} onChange={e => setLen(+e.target.value)} /></>}
      <p className={`big ${A.forced > 0 ? 'err' : 'ok'}`}>{line('지금 안', A)}</p>
      <p className={`big ${B.forced > 0 ? 'err' : 'ok'}`}>{line('고친 안', B)}</p>
      <button className="btn" onClick={() => setKind((kind + 1) % 3)}>다른 경우 보기</button>
      <p className="muted">숫자 계산은 ④와 같은 엔진입니다. <Demo /></p>
    </section>
  );
}

/* ④-4 노후 장기 전망 */
export function Retire({ client: c, go, st }) {
  const cc = { ...c, age: c.age || 30 }, m = st.market, a = c.planA.alloc[3], b = c.planB.alloc[3];
  const rows = [[`A안 (계속 ${a}%)`, retirement(cc, m, a, a)], [`B안 (입주 후 ${a}% 복귀)`, retirement(cc, m, b, a, c.months)], [`B안 (${b}% 유지)`, retirement(cc, m, b, b)]];
  return (
    <>
      <Head back={() => go('result')} title="노후 장기 전망" sub={<>60세까지 월 연금 납입 · 연 {m.pension.value}% 복리 <Demo /></>} step={4} />
      <section className="pad">
        <div className="card"><table className="cmp"><thead><tr><th /><th>60세 적립</th><th>현재가치</th></tr></thead>
          <tbody>{rows.map(([l, r]) => <tr key={l}><td>{l}</td><td>{fmt(r.fv).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td><td>{fmt(r.pv).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td></tr>)}</tbody></table></div>
        <p className="muted">현재 {cc.age}세 기준, 현재가치 = 적립액 ÷ (1+물가 {m.cpi.value}%)^{60 - cc.age}년. 소득·지출 현재 수준 유지 가정이고 기간 밖 생애 이벤트는 반영하지 않습니다.</p>
      </section>
    </>
  );
}

/* ④-5 확률 시뮬레이션 */
function Band({ band, target, living }) {
  const W = 340, H = 120, L = 30, n = band.length, max = Math.max(target, ...band.map(b => b[2])) * 1.05 || 1;
  const x = i => L + (i * (W - L - 4)) / Math.max(1, n - 1), y = v => 4 + (H - 18) * (1 - v / max);
  const area = band.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b[2])}`).join('') + band.map((b, i) => `L${x(n - 1 - i)},${y(band[n - 1 - i][0])}`).join('') + 'Z';
  const mid = band.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b[1])}`).join('');
  return <svg viewBox={`0 0 ${W} ${H}`} className="chart"><path d={area} className="bandfill" /><path d={mid} className="lb" /><line x1={L} x2={W} y1={y(target)} y2={y(target)} className="tgt" /><text x={L - 4} y={y(0) + 3} textAnchor="end">0</text><text x={L - 4} y={y(max / 1.05) + 8} textAnchor="end">{Math.round(max / 1.05)}</text></svg>;
}
export function Prob({ client: c, go, st }) {
  const [res, setRes] = useState(null);
  const calc = () => setRes(monteCarlo({ client: c, plans: [c.planA, c.planB], market: toMarket(st.market), months: c.months, startMonth: c.startMonth }));
  const rows = res && [['비상자금이 바닥나지 않을 확률', 'noBottom'], ['목표 80% 이상 모일 확률', 'g80'], ['목표 100% 이상 모일 확률', 'g100'], [`강제 매도가 손실 한도(${c.psychLimit}) 초과할 확률`, 'over']];
  return (
    <>
      <Head back={() => go('result')} title="확률 시뮬레이션" sub="소득과 투자수익이 무작위로 흔들리는 5,000개 경로 (시드 2026)" step={4} />
      <section className="pad">
        <button className="btn" onClick={calc}>{res ? '다시 계산' : '5,000개 경로 계산'}</button>
        {res && <>
          <div className="card"><table className="cmp sm"><thead><tr><th /><th><span className="pillA">A안</span></th><th><span className="pillB">B안</span></th></tr></thead>
            <tbody>{rows.map(([l, k]) => <tr key={k}><td>{l}</td><td>{fmt(res[0][k], 1)}%</td><td>{fmt(res[1][k], 1)}%</td></tr>)}<tr><td>중앙 달성률</td><td>{fmt(res[0].medianGoal, 1)}%</td><td>{fmt(res[1].medianGoal, 1)}%</td></tr></tbody></table></div>
          {['A', 'B'].map((w, k) => <div className="card" key={w}><p className="label">{w}안 비상자금 (하위 10% ~ 상위 10%, 선 = 중앙값)</p><Band band={res[k].band} target={c.living * c.emergencyMonths} living={c.living} /></div>)}
        </>}
        <p className="muted">확률은 가정에 따라 달라집니다(소득 변동 30%, 소득 공백 월 1%, 투자 변동성 18%). 예측이 아니라 계획의 견고함 비교용입니다.</p>
      </section>
    </>
  );
}

/* ⑤-1 선임 검토 */
export function Review({ client: c, updWork, go, st }) {
  const [op, setOp] = useState('');
  const plan = adoptedPlan(c);
  const checks = [
    ['AI 점검 항목 모두 판정', checkPlan(c, c.planA, st.market).filter(r => r.flag).every(r => c.work.judge[r.id])],
    ['시나리오 3개 이상 검증', true],
    ['적합성 통과', plan.alloc[2] <= PROFILE_MAX[c.grade]],
    ['설명·확인 기록 완료', !!c.work.record?.confirm],
  ];
  return (
    <>
      <Head back={() => go('record')} title="선임 검토" sub={<>담당 설계사 → 선임 설계사 <Demo /></>} step={5} />
      <section className="pad">
        <div className="card">{checks.map(([l, ok]) => <p key={l} className={ok ? 'ok' : 'err'}>{ok ? '✓' : '✕'} {l}</p>)}</div>
        <Field label="선임 의견 (수정 요청 시 필수)"><textarea rows={3} value={op} onChange={e => setOp(e.target.value)} /></Field>
        <div className="row two">
          <button className="btn ghost" disabled={!op.trim()} onClick={() => { updWork({ review: { rejected: true, opinion: op } }); go('result'); }}>수정 요청</button>
          <button className="btn" disabled={!checks.every(x => x[1])} onClick={() => { updWork({ review: { approvedAt: new Date().toLocaleString('ko-KR'), role: '선임 설계사' } }); go('report'); }}>승인</button>
        </div>
        <p className="muted">화면과 리포트에는 이름 대신 역할명만 씁니다(블라인드).</p>
      </section>
    </>
  );
}

/* ⑤-3 고객용 제안서 */
export function Proposal({ client: c, go, st }) {
  const plan = adoptedPlan(c), r = run(c, null, plan, [], st.market), stress = run(c, null, plan, [{ type: 'stop', at: 10, len: 3 }], st.market);
  const ap = annualPlus(c, st.market) / 12;
  const sel = (c.work.schemes || []).map(id => ({ youth: '청년미래적금', umbrella: '노란우산공제', isa27: 'ISA 2027 개편안(국회 통과 전제)' })[id]);
  return (
    <>
      <Head back={() => go('report')} title="고객용 제안서" sub={<>숫자는 엔진 결과만 사용 · 문장 초안은 설계사가 수정 <Demo /></>} step={6} />
      <section className="pad prop">
        <h2>{c.name} 님, 일이 줄어도 {fmt(stress.minMonths, 1)}개월은 버티는 계획이에요</h2>
        <div className="card"><p className="label">핵심 약속 3개</p>
          <p>1. 비상자금을 먼저 채워요 (충격이 없을 때 최저 {fmt(r.minMonths, 1)}개월분)</p>
          <p>2. 목표 {c.goalName} {fmt(r.goalPct)}%까지 모아요</p>
          <p>3. 3개월 쉬게 되는 경우에도 손해 보며 파는 돈 {fmt(stress.forced)}만원 이내로 관리해요</p></div>
        <div className="card"><p className="label">이번 달 할 일</p>
          {plan.alloc.map((p, i) => <p key={i}>• {LABEL[i]}에 월 약 {fmt((ap * p) / 100)}만원 (여유가 있는 달 기준)</p>)}
          {sel.length > 0 && <p>• 확인해 볼 제도: {sel.join(', ')}</p>}</div>
        <div className="card"><p className="label">위험 고지</p><p className="muted">시나리오는 예측이 아니라 계획 비교용이며, 투자 상품은 원금 손실이 날 수 있습니다. 시장 기준일 {st.market.asOf}.</p></div>
        <button className="btn noprint" onClick={() => window.print()}>PDF 저장</button>
        <button className="btn ghost noprint" onClick={() => navigator.clipboard?.writeText(location.href)}>링크 복사</button>
      </section>
    </>
  );
}

/* ⑥ 모니터링 */
export function Monitor({ client: c, upd, go, st }) {
  const [el, setEl] = useState(8), [inc, setInc] = useState([120, 100, 110]), [emg, setEmg] = useState(880);
  const plan = adoptedPlan(c), m = st.market;
  const base = run(c, null, plan, [], m);
  const pl = [0, 1, 2].reduce((s, k) => { const i = el - 3 + k, cal = ((c.startMonth - 1 + i) % 12) + 1; return s + (c.type === 'fixed' ? c.income : c.incomeByMonth[cal]); }, 0);
  const dec = pl ? 1 - inc.reduce((a, b) => a + b, 0) / pl : 0, em = emg / c.living;
  const lv = alertLevel(dec, em, c.emergencyMonths);
  const W = 340, H = 130, L = 30, n = base.emgArr.length, max = Math.max(c.living * c.emergencyMonths, emg, ...base.emgArr) * 1.08;
  const x = i => L + (i * (W - L - 4)) / Math.max(1, n - 1), y = v => 4 + (H - 20) * (1 - v / max);
  const revalidate = () => { upd({ emergency: emg, status: 'recheck' }); go('scen'); };
  return (
    <>
      <Head back={() => go('report')} title="모니터링" sub={`${el}개월 후 예시 · 채택안 ${c.adopted || 'B'}`} step={6} />
      <section className="pad">
        <div className="card grid2">
          <Field label="실행 후 경과(개월)"><NumIn value={el} onChange={v => setEl(Math.max(3, Math.min(n, v || 3)))} /></Field>
          <Field label="현재 비상자금 잔액"><NumIn value={emg} onChange={setEmg} /></Field>
          {inc.map((v, i) => <Field key={i} label={`최근 소득 ${i + 1}`}><NumIn value={v} onChange={x2 => setInc(inc.map((y2, j) => (j === i ? x2 : y2)))} /></Field>)}
        </div>
        <div className={`card alert l${lv}`}><b>{lv ? `${GRADES[lv]} · 재검증 필요` : '정상'}</b><p>3개월 소득 하락률 {fmt(dec * 100)}% (계획 {fmt(pl)} → 실제 {inc.reduce((a, b) => a + b, 0)}) · 비상자금 {fmt(em, 1)}개월</p>
          {lv > 0 && <p className="muted">고객 안내: 최근 소득이 계획보다 낮아요. 지출을 점검하고 안을 다시 확인해 볼게요.</p>}</div>
        <div className="card"><p className="label">계획선(보라) · 실제(●)</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="chart"><path d={base.emgArr.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} className="la" /><circle cx={x(el - 1)} cy={y(emg)} r="5" fill="#d93636" /><text x={x(el - 1)} y={y(emg) - 8} textAnchor="middle">{emg}</text></svg></div>
        <button className="btn" onClick={revalidate}>현재 잔액으로 재검증</button>
        <p className="muted">시장 기준일을 갱신해도 재검증 대상이 됩니다.</p>
      </section>
    </>
  );
}

/* ⑤-4 제안 이력 */
export function History({ client: c, upd, go, st }) {
  const h = c.history || [];
  const [a, setA] = useState(0), [b, setB] = useState(Math.max(0, h.length - 1));
  const snap = (v, note) => snapshot(c, st.market, v, note);
  const supplement = () => { const last = h[h.length - 1]; const [mj, mn = '0'] = String(last.v).replace('v', '').split('.'); upd({ history: [...h, snap(`v${mj}.${+mn + 1}`, '보완')] }); };
  const A = h[a], B = h[b];
  const alloc = p => p.alloc.join('/');
  return (
    <>
      <Head back={() => go('report')} title="제안 이력" sub="채택·보완·재검증마다 버전이 쌓입니다" step={6} />
      <section className="pad">
        {h.length === 0 && <p className="muted">아직 채택 기록이 없습니다.</p>}
        {h.map((x, i) => <div className="card" key={i}><b>{x.v}</b> <span className="muted">{x.date} · {x.note} · {x.adopted}안 채택</span></div>)}
        {h.length > 0 && <button className="btn ghost" onClick={supplement}>보완 버전 저장</button>}
        {h.length > 1 && <>
          <div className="row two"><select value={a} onChange={e => setA(+e.target.value)}>{h.map((x, i) => <option key={i} value={i}>{x.v}</option>)}</select><select value={b} onChange={e => setB(+e.target.value)}>{h.map((x, i) => <option key={i} value={i}>{x.v}</option>)}</select></div>
          <div className="card"><table className="cmp sm"><thead><tr><th /><th>{A.v}</th><th>{B.v}</th></tr></thead><tbody>
            <tr><td>A안 비중</td><td>{alloc(A.planA)}</td><td>{alloc(B.planA)}</td></tr>
            <tr><td>B안 비중</td><td>{alloc(A.planB)}</td><td>{alloc(B.planB)}</td></tr>
            <tr><td>B안 재배치</td><td>{A.planB.realloc ? `${A.planB.realloc.invToEmerg || 0}/${A.planB.realloc.invToGoal || 0}` : '-'}</td><td>{B.planB.realloc ? `${B.planB.realloc.invToEmerg || 0}/${B.planB.realloc.invToGoal || 0}` : '-'}</td></tr>
            <tr><td>B 최저 개월</td><td>{fmt(A.mB.min, 1)}</td><td>{fmt(B.mB.min, 1)}</td></tr>
            <tr><td>B 달성률</td><td>{fmt(A.mB.goal)}%</td><td>{fmt(B.mB.goal)}%</td></tr>
            <tr><td>B 최고 경보</td><td>{A.mB.grade}</td><td>{B.mB.grade}</td></tr></tbody></table></div>
        </>}
        <button className="btn ghost noprint" onClick={() => window.print()}>인쇄 / 이미지로 저장</button>
        <p className="muted">재검증 채택 시 새 버전(v2)이 자동으로 생깁니다.</p>
      </section>
    </>
  );
}
export const pick = r => ({ min: r.minMonths, goal: r.goalPct, grade: r.grade });
export const snapshot = (c, m, v, note) => ({ v, note, date: new Date().toLocaleDateString('ko-KR'), adopted: c.adopted, planA: c.planA, planB: c.planB, mA: pick(summary(c, m, c.planA)), mB: pick(summary(c, m, c.planB)) });

/* ⓪-3 일정·알림 */
const addMonths = (iso, k) => { const d = new Date(iso); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 10); };
export function Schedule({ st, setSt, go }) {
  const [f, setF] = useState('전체'), [add, setAdd] = useState(null), [copied, setCopied] = useState('');
  const today = st.market.asOf;
  const auto = [];
  const targets = st.clients.filter(c => c.planB?.alloc[3] > 0 || c.planA?.alloc[3] > 0);
  auto.push({ id: 'pension', date: `${today.slice(0, 4)}-12-17`, title: `연말 연금저축·IRP 납입 마감 2주 전 (대상 ${targets.length}명)`, cat: '세제', auto: true });
  st.clients.filter(c => c.status === 'adopted' || c.status === 'recheck').forEach(c => {
    const at = c.work.record?.atISO || today;
    auto.push({ id: `q-${c.id}`, date: addMonths(at, 3), title: `${c.name} · 채택안 정기 점검 (분기)`, cat: '점검', auto: true });
    if (c.type === 'variable') {
      const avg = Object.values(c.incomeByMonth).reduce((a, b) => a + b, 0) / 12;
      for (let k = 1; k <= 12; k++) { const d = addMonths(today.slice(0, 8) + '01', k), m = +d.slice(5, 7); if (c.incomeByMonth[m] < avg * 0.6) { auto.push({ id: `s-${c.id}`, date: d, title: `${c.name} · 비수기 진입 점검 (${m}월 소득 ${c.incomeByMonth[m]})`, cat: '점검', auto: true }); break; } }
    }
  });
  st.clients.forEach(c => { if (c.isaEnd) auto.push({ id: `isa-${c.id}`, date: addMonths(c.isaEnd, -1), title: `${c.name} · ISA 만기 30일 전 안내`, cat: '만기', auto: true }); });
  const all = [...auto, ...(st.schedule || [])].filter(x => f === '전체' || x.cat === f).sort((a, b) => a.date.localeCompare(b.date));
  const save = () => { if (!add.title || !add.date) return; setSt(s => ({ ...s, schedule: [...(s.schedule || []), { ...add, id: 'm' + Date.now(), cat: '상담' }] })); setAdd(null); };
  const msg = x => `[안내] ${x.date.replace(/-/g, '.')} ${x.title.replace(/ \(대상.*\)/, '')} 일정이 있습니다. 확인 부탁드립니다.`;
  return (
    <>
      <Head back={() => go('home')} title="일정·알림" sub="상담, 만기, 세제 마감, 점검 일정을 한곳에서" />
      <div className="tabbar">{['전체', '상담', '만기', '세제', '점검'].map(t => <button key={t} className={f === t ? 'on' : ''} onClick={() => setF(t)}>{t}</button>)}</div>
      <section className="pad">
        {all.length === 0 && <p className="muted">일정이 없습니다. 채택안이 생기면 점검 일정이 자동으로 만들어집니다.</p>}
        {all.map(x => (
          <div className="card" key={x.id}><div className="row between"><b>{x.date.replace(/-/g, '.')}</b><span><span className={`tag c-${x.cat}`}>{x.cat}</span>{x.auto && <span className="tag">자동 등록</span>}</span></div>
            <p>{x.title}</p><button className="link left" onClick={() => { navigator.clipboard?.writeText(msg(x)); setCopied(x.id); }}>{copied === x.id ? '복사했습니다' : '고객 안내 문구 복사'}</button></div>
        ))}
        {add ? <div className="card"><Field label="날짜"><input type="date" value={add.date} onChange={e => setAdd({ ...add, date: e.target.value })} /></Field><Field label="내용"><input value={add.title} onChange={e => setAdd({ ...add, title: e.target.value })} /></Field><button className="btn" onClick={save}>저장</button></div>
          : <button className="dashed" onClick={() => setAdd({ date: today, title: '' })}>+ 일정 직접 추가</button>}
        <p className="muted">알림 실제 발송(카카오 알림톡)은 외부 계약이 필요해 문구 복사로 대체했습니다.</p>
      </section>
    </>
  );
}

/* 시연 화면 모음 (외부 연동 필요) */
const DEMOS = [
  ['s8', '①-1 서류로 자동 입력', 'AI가 값을 찾아 입력칸 후보를 만들고 설계사는 확인만 합니다. AI 추출값은 체크 전에는 어디에도 반영되지 않습니다.'],
  ['s9', '①-1b 마이데이터 연동', '고객 동의로 금융기관 정보를 불러옵니다. 본인신용정보관리업 허가 또는 제휴가 필요합니다. 화면 속 기관명은 가상입니다.'],
  ['s3', '⓪-2b 시장 데이터 자동 갱신', '한국은행 ECOS·KOSIS API로 매일 09:00 조회합니다. API 키 발급과 서버가 필요합니다.'],
  ['s5', '⓪-3b 알림 보내기', '카카오 알림톡 발송입니다. 비즈니스 채널·템플릿 승인·발송 대행 계약이 필요합니다.'],
];
export function Demos({ go }) {
  return (
    <>
      <Head back={() => go('settings')} title="시연 화면" sub="외부 연동이 있어야 실제로 작동하는 화면입니다" />
      <section className="pad">
        {DEMOS.map(([img, t, d]) => <div className="card" key={img}><p className="label">{t} <Demo /></p><img className="shot" src={`/wf/${img}.png`} alt={t} loading="lazy" /><p className="muted">{d}</p></div>)}
      </section>
    </>
  );
}
