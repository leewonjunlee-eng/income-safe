import React, { useState } from 'react';
import { Head, Foot, Dot, Field, NumIn, Slider, calLabel, fmt, LABEL, shocksOf, summary, Chart } from './ui.jsx';
import * as X from './Extra.jsx';
import { checkPlan, monthsBetween, SCENARIOS, toShock, run, GRADE_LIST, PROFILE_MAX } from './rules.js';

const snapshot = X.snapshot;
const Sfx = ({ children, ...p }) => <label className="sfx"><NumIn {...p} /><span>{children}</span></label>;
const Seg = ({ items, value, onChange }) => (
  <div className="seg">{items.map((t, i) => <button key={t} className={value === i ? 'on' : ''} onClick={() => onChange(i)}>{t.label || t}{t.dot && <i className="reddot" />}</button>)}</div>
);

/* ① 고객 정보 */
export function Info({ client: c, upd, go, st }) {
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
  const incs = c.type === 'variable' ? Array.from({ length: 12 }, (_, i) => +c.incomeByMonth[i + 1] || 0) : [];
  const sum = incs.reduce((a, b) => a + b, 0), avg = sum / 12, min = Math.min(...incs);
  const lowMonths = incs.map((v, i) => (v === min ? i + 1 : null)).filter(Boolean);
  const range = lowMonths.length > 1 ? `${lowMonths[0]}~${lowMonths[lowMonths.length - 1]}월` : `${lowMonths[0]}월`;
  const prompt = () => `당신은 재무설계 전문가입니다. 아래 고객에게 맞는 자산배분안(비상자금/목표 예금/투자/연금 월 비중 %)을 제안하세요. 한도와 세율은 현행 기준으로 근거와 함께 쓰세요.\n- 소득: ${c.type === 'fixed' ? `고정형 세후 ${c.income}만원` : `변동형 월 ${Object.values(c.incomeByMonth).join('/')}만원 (1~12월)`}, 세금 몫 ${fmt(c.taxShare * 100)}%\n- 생활비 월 ${c.living}만원, 월 대출 상환 ${c.loanPay || 0}만원\n- 비상자금 ${c.emergency}, 투자자산 ${c.invest}, 목표 예금 ${c.goalDeposit} (만원)\n- 목표: ${c.goalName} ${c.goalAmount}만원, ${c.goalDate} (${mo ?? '-'}개월)\n- 투자성향 ${c.grade}, 심리적 손실 한도 ${c.psychLimit}만원`;
  const save = () => { upd({ months: mo, status: c.status === 'before' ? 'inprogress' : c.status }); go('plan'); };
  return (
    <>
      <Head back={() => go('home')} backLabel="고객" title={`고객 정보 · ${c.name}`} sub="시뮬레이션 기준값을 확인하세요" step={1} />
      <section className="pad">
        <Seg items={['소득', '지출', '자산', '목표', '보험·성향'].map((t, i) => ({ label: t, dot: errs[i] }))} value={tab} onChange={setTab} />
        {c.survey && !c.surveyApplied && <div className="panel blue"><b>사전 설문 도착</b><p className="muted">고객이 입력한 답변은 초안입니다. 확인 후 반영하세요.</p><button className="btn sm" onClick={() => upd(X.applySurvey(c))}>설문 답변을 입력칸에 반영</button></div>}
        {tab === 0 && <>
          <div className="card"><p className="ttl">소득 유형</p>
            <div className="row two">{[['fixed', '고정형 (월급)'], ['variable', '변동형 (매출)']].map(([k, l]) => <button key={k} className={`opt ${c.type === k ? 'on' : ''}`} onClick={() => upd({ type: k, taxShare: k === 'fixed' ? 0 : c.taxShare || 0.15, emergencyMonths: k === 'fixed' ? 3 : 6 })}>{l}</button>)}</div></div>
          {c.type === 'fixed'
            ? <div className="card"><Field label="월 소득 (세후, 만원)" err={empty(c.income) ? '필수 항목입니다' : ''}><NumIn value={c.income} onChange={v => set('income', v)} /></Field></div>
            : <div className="card"><div className="row between"><p className="ttl">월별 소득 계획</p><span className="muted">단위 만 원</span></div>
              <div className="mgrid">{Array.from({ length: 12 }, (_, i) => i + 1).map(m => { const v = +c.incomeByMonth[m] || 0; const cls = v >= avg * 1.25 ? 'hi' : v <= avg * 0.6 ? 'lo' : ''; return <label key={m} className={`mcell ${cls}`}><span>{m}월</span><input type="number" inputMode="numeric" value={c.incomeByMonth[m] ?? ''} onChange={e => setInc(m, e.target.value === '' ? '' : Number(e.target.value))} /></label>; })}</div>
              <div className="row between sum"><span>연 소득 <b>{fmt(sum).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</b></span><span>월평균 <b>{fmt(avg)}</b></span><span>최저 <b className="amb">{min}</b> ({range})</span></div></div>}
          <div className="card row between"><div><p className="ttl">세금·보험 몫</p><p className="muted">{c.type === 'fixed' ? '고정형은 0으로 고정' : '소득에서 먼저 떼어 두는 비율'}</p></div><Sfx disabled={c.type === 'fixed'} value={fmt(c.taxShare * 100)} onChange={v => set('taxShare', v / 100)}>%</Sfx></div>
        </>}
        {tab === 1 && <div className="card">
          <Field label="고정 생활비 (월, 만원)" err={empty(c.living) ? '필수 항목입니다' : ''}><NumIn value={c.living} onChange={v => set('living', v)} /></Field>
          <Field label="월 대출 상환액"><NumIn value={c.loanPay} onChange={v => set('loanPay', v)} /></Field>
          <Field label="대출 잔액"><NumIn value={c.loanBal} onChange={v => set('loanBal', v)} /></Field></div>}
        {tab === 2 && <div className="card">
          <Field label="비상자금" err={empty(c.emergency) ? '필수 항목입니다' : ''}><NumIn value={c.emergency} onChange={v => set('emergency', v)} /></Field>
          <Field label="투자자산" err={empty(c.invest) ? '필수 항목입니다' : ''}><NumIn value={c.invest} onChange={v => set('invest', v)} /></Field>
          <Field label="목표용 예금" err={empty(c.goalDeposit) ? '필수 항목입니다' : ''}><NumIn value={c.goalDeposit} onChange={v => set('goalDeposit', v)} /></Field></div>}
        {tab === 3 && <div className="card">
          <Field label="목표 이름"><input value={c.goalName} onChange={e => set('goalName', e.target.value)} /></Field>
          <Field label="목표 금액 (만원)"><NumIn value={c.goalAmount} onChange={v => set('goalAmount', v)} /></Field>
          <Field label="목표 시점" err={mo == null ? '1~60개월 사이로 입력해 주세요' : ''} hint={mo != null ? `기간 ${mo}개월` : ''}><input type="month" value={c.goalDate} onChange={e => set('goalDate', e.target.value)} /></Field>
          <Field label="비상자금 목표 개월수" hint={`목표 금액 = 생활비 × 개월수 = ${fmt(target)}만원 (고정형 3 · 변동형 6 기본)`}><NumIn value={c.emergencyMonths} onChange={v => set('emergencyMonths', v)} /></Field>
          <Field label="심리적 손실 한도 (만원)" hint="면담에서 확인한 견딜 수 있는 최대 손실"><NumIn value={c.psychLimit} onChange={v => set('psychLimit', v)} /></Field></div>}
        {tab === 4 && <div className="card">
          <Field label="소득보상 보험 월 금액 (만원)"><NumIn value={c.insurance.monthly} onChange={v => set('insurance', { ...c.insurance, monthly: v })} /></Field>
          <Field label="최대 보상 개월수"><NumIn value={c.insurance.months} onChange={v => set('insurance', { ...c.insurance, months: v })} /></Field>
          <Field label="투자성향" hint={`허용 고위험 자산 비중 ${PROFILE_MAX[c.grade]}%`}><select value={c.grade} onChange={e => set('grade', e.target.value)}>{GRADE_LIST.map(g => <option key={g}>{g}</option>)}</select></Field>
          {c.psychLimit < (c.emergency + c.invest + c.goalDeposit) * 0.15 && <p className="warn">손실 회피 성향 강함 (심리 한도가 총자산의 15% 미만)</p>}</div>}
        <div className="row two"><button className="chip" onClick={() => go('events')}>생애 이벤트</button><button className="chip" onClick={() => go('goals')}>목표 우선순위</button><button className="chip" onClick={() => go('house')}>가구 단위</button></div>
      </section>
      <Foot>
        <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(prompt()); setCopied(true); }}>{copied ? '복사했습니다' : 'AI에 넣을 질문 복사'}</button>
        <button className="btn" disabled={!ok} onClick={save}>저장하고 다음</button>
      </Foot>
    </>
  );
}

/* ② 배분안 + AI 점검 */
export function Plan({ client: c, upd, updWork, go, st }) {
  const [rules, setRules] = useState(false), [ai, setAi] = useState('');
  const setAlloc = (k, i, v) => upd({ [k]: { ...c[k], alloc: c[k].alloc.map((x, j) => (j === i ? v : x)) } });
  const setRe = (k, f, v) => upd({ [k]: { ...c[k], realloc: { ...(c[k].realloc || {}), [f]: v } } });
  const sumOf = p => p.alloc.reduce((a, b) => a + (+b || 0), 0);
  const reTot = p => (+p.realloc?.invToEmerg || 0) + (+p.realloc?.invToGoal || 0);
  const checks = checkPlan(c, c.planA, st.market), flagged = checks.filter(r => r.flag);
  const judged = flagged.every(r => c.work.judge[r.id]);
  const errs = [sumOf(c.planA) !== 100 && 'A안 합계가 100%가 아닙니다', sumOf(c.planB) !== 100 && 'B안 합계가 100%가 아닙니다',
    (reTot(c.planA) > c.invest || reTot(c.planB) > c.invest) && '재배치 금액이 투자자산을 넘습니다', !judged && '점검 항목을 모두 판정해 주세요'].filter(Boolean);
  const checksB = checkPlan(c, c.planB, st.market).filter(r => r.flag);
  const pill = (
    <div className="tr head3"><span /><span className="pillA">A안 · AI 원안</span><span className="pillB">B안 · 수정안</span></div>
  );
  return (
    <>
      <Head back={() => go('info')} backLabel="고객 정보" title="배분안 입력" sub="월 가용액을 어디에 나눠 넣을지 입력하세요" step={2} />
      <section className="pad">
        <div className="card">
          {pill}
          {LABEL.map((l, i) => <div className="tr" key={l}><span>{i === 3 ? '연금저축' : l}</span><Sfx value={c.planA.alloc[i]} onChange={v => setAlloc('planA', i, v)}>%</Sfx><Sfx value={c.planB.alloc[i]} onChange={v => setAlloc('planB', i, v)}>%</Sfx></div>)}
          <div className="tr tot"><b>합계</b><b className={sumOf(c.planA) === 100 ? 'ok' : 'err'}>{sumOf(c.planA)}%</b><b className={sumOf(c.planB) === 100 ? 'ok' : 'err'}>{sumOf(c.planB)}%</b></div>
        </div>
        <div className="card"><p className="ttl">기존 자산 재배치 <span className="muted">· 만 원 (투자자산 {c.invest} 안에서)</span></p>
          {[['투자 → 비상자금', 'invToEmerg'], ['투자 → 목표 예금', 'invToGoal']].map(([l, f]) => <div className="tr" key={f}><span>{l}</span><NumIn value={c.planA.realloc?.[f] ?? 0} onChange={v => setRe('planA', f, v)} /><NumIn value={c.planB.realloc?.[f] ?? 0} onChange={v => setRe('planB', f, v)} /></div>)}</div>
        <div className="panel amber">
          <div className="row between"><b className="amb">AI 원안 점검 · 주의 {flagged.length}건</b><span className="muted">{checks.length - flagged.length}개 통과 · <button className="lnk" onClick={() => setRules(!rules)}>기준</button></span></div>
          {rules && <ul className="rules">{checks.map(r => <li key={r.id}><b>{r.label}</b> <span className="muted">{r.detail}</span></li>)}</ul>}
          {flagged.map(r => (
            <div key={r.id} className="chk2"><div><b>{r.label}</b><p className="muted">{r.detail}</p></div>
              <div className="row tight">{[['ok', 'AI 맞음'], ['fix', '수정 반영']].map(([v, l]) => <button key={v} className={`jb ${v} ${c.work.judge[r.id] === v ? 'on' : ''}`} onClick={() => updWork({ judge: { ...c.work.judge, [r.id]: v } })}>{l}</button>)}</div></div>
          ))}
          {flagged.length === 0 && <p className="ok">A안에 주의할 항목이 없습니다.</p>}
        </div>
        {checksB.length > 0 && <p className="warn">B안도 주의 {checksB.length}건: {checksB.map(r => r.label).join(', ')}</p>}
        <details className="card"><summary>AI 답변 캡처 · 세액공제액 (선택)</summary>
          <Field label="AI가 말한 연금저축 세액공제액 (만원)"><NumIn value={c.planA.aiCredit ?? ''} onChange={v => upd({ planA: { ...c.planA, aiCredit: v } })} /></Field>
          <Field label="AI 답변 메모"><textarea rows={3} value={ai} onChange={e => setAi(e.target.value)} /></Field></details>
        <div className="row two"><button className="chip" onClick={() => go('aicmp')}>AI 답변 비교</button><button className="chip" onClick={() => go('prod')}>상품·세제</button><button className="chip" onClick={() => go('schemes')}>제도</button></div>
        {errs.map(e => <p key={e} className="err">{e}</p>)}
      </section>
      <Foot><button className="btn" disabled={errs.length > 0} onClick={() => go('scen')}>시뮬레이션 실행</button></Foot>
    </>
  );
}

/* ③ 시나리오 선택 */
export function Scen({ client: c, updWork, go, st }) {
  const sel = c.work.shocks, n = Object.keys(sel).length;
  const [msg, setMsg] = useState('');
  const toggle = t => {
    const s = { ...sel };
    if (s[t]) delete s[t]; else if (n >= 2) return setMsg('최대 2개까지 선택할 수 있습니다'); else s[t] = { ...SCENARIOS[t].def };
    setMsg(''); updWork({ shocks: s });
  };
  const setP = (t, patch) => updWork({ shocks: { ...sel, [t]: { ...sel[t], ...patch } } });
  const errs = Object.entries(sel).filter(([t, p]) => p.at < 1 || p.at > c.months).map(([t]) => `${SCENARIOS[t].name}: 기간(${c.months}개월) 안으로 입력해 주세요`);
  const endLabel = (p, len) => calLabel(c, Math.min(c.months, p.at + len - 1));
  const Row = ({ l, r, children }) => <div className="srow"><div className="row between"><span className="muted">{l}</span><span className="rv">{r}</span></div>{children}</div>;
  const body = {
    stop: p => <><Row l="시작" r={<><b>{p.at}개월 후</b> · {calLabel(c, p.at)}</>}><Slider min={1} max={c.months} value={p.at} onChange={v => setP('stop', { at: v })} /></Row>
      <Row l="기간" r={<><b>{p.len}개월</b> · {endLabel(p, p.len)}까지</>}><Slider min={1} max={12} value={p.len} onChange={v => setP('stop', { len: v })} /></Row>
      {c.insurance.monthly > 0 && <p className="muted">보험 소득보상 월 {c.insurance.monthly}만원 자동 반영</p>}</>,
    cut: p => <><Row l="감소율" r={<b>−{p.drop}%</b>}><Slider min={10} max={90} step={5} value={p.drop} onChange={v => setP('cut', { drop: v })} /></Row>
      <Row l="시작" r={<><b>{p.at}개월 후</b> · {calLabel(c, p.at)}</>}><Slider min={1} max={c.months} value={p.at} onChange={v => setP('cut', { at: v })} /></Row>
      <Row l="기간" r={<b>{p.len}개월</b>}><Slider min={1} max={12} value={p.len} onChange={v => setP('cut', { len: v })} /></Row></>,
    lump: p => <><Row l="금액" r={<b>{p.amount}만 원</b>}><Slider min={100} max={2000} step={50} value={p.amount} onChange={v => setP('lump', { amount: v })} /></Row>
      <Row l="시점" r={<><b>{p.at}개월 후</b> · {calLabel(c, p.at)}</>}><Slider min={1} max={c.months} value={p.at} onChange={v => setP('lump', { at: v })} /></Row></>,
    crash: p => <><div className="chips">{st.market.crashes.map(x => <button key={x.name} className={`chip ${p.preset === x.name ? 'on' : ''}`} onClick={() => setP('crash', { preset: x.name })}>{x.name} −{x.drop}%</button>)}</div>
      <Row l="시점" r={<><b>{p.at}개월 후</b> · {calLabel(c, p.at)}</>}><Slider min={1} max={c.months} value={p.at} onChange={v => setP('crash', { at: v })} /></Row></>,
    rate: p => <><Row l="상승폭" r={<b>+{p.pp}%p</b>}><Slider min={0.25} max={3} step={0.25} value={p.pp} onChange={v => setP('rate', { pp: v })} /></Row>
      <Row l="시점" r={<><b>{p.at}개월 후</b></>}><Slider min={1} max={c.months} value={p.at} onChange={v => setP('rate', { at: v })} /></Row></>,
  };
  const SUB = { stop: '실직·출산·부상으로 소득 0원', cut: '매출이 일정 기간 줄어듦 · 기본 −40% (변동형)', lump: '의료비·이사 등 · 기본 500만 원', crash: `프리셋 ${st.market.crashes.map(x => `${x.name} −${x.drop}%`).join(' · ')}`, rate: '변동금리 대출 고객만' };
  const avail = t => !((SCENARIOS[t].variableOnly && c.type !== 'variable') || (SCENARIOS[t].loanOnly && !(c.loanBal > 0)));
  return (
    <>
      <Head back={() => go('plan')} backLabel="배분안" title="시나리오 선택" sub="두 안에 똑같이 적용됩니다 · 최대 2개 동시 선택" step={3} />
      <section className="pad">
        <button className={`scard ${n === 0 ? 'on' : ''}`} onClick={() => updWork({ shocks: {} })}><i className={`cb ${n === 0 ? 'on' : ''}`} /><div><b>충격 없음</b><p className="muted">기준 비교용</p></div></button>
        {['stop', 'cut', 'lump', 'crash', 'rate'].map(t => avail(t) && (
          <div key={t} className={`scard col ${sel[t] ? 'on' : ''}`}>
            <button className="shead" onClick={() => toggle(t)}><i className={`cb ${sel[t] ? 'on' : ''}`} /><div><b>{SCENARIOS[t].name}</b><p className="muted">{SUB[t]}</p></div></button>
            {sel[t] && <div className="sbody">{body[t](sel[t])}</div>}
          </div>
        ))}
        {sel.event
          ? <div className="scard col on"><button className="shead" onClick={() => toggle('event')}><i className="cb on" /><div><b>생애 이벤트 · {sel.event.name}</b><p className="muted">{sel.event.at}개월 후 · 목돈 {sel.event.lump || 0} · 생활비 +{sel.event.living || 0}</p></div></button></div>
          : <button className="scard" onClick={() => go('events')}><div><b>생애 이벤트</b><p className="muted">템플릿 선택 (결혼·출산·이직·주택 구입 등)</p></div><span>›</span></button>}
        {msg && <p className="err">{msg}</p>}{errs.map(e => <p key={e} className="err">{e}</p>)}
        <p className="muted center">시뮬레이션 기간 {c.months}개월 ({calLabel(c, 1)} ~ {calLabel(c, c.months)}) · 수익률은 고정 가정</p>
      </section>
      <Foot><button className="btn" disabled={errs.length > 0} onClick={() => go('result')}>비교하기</button></Foot>
    </>
  );
}

/* ④ 결과 비교 + 플래너 판단 */
export function Result({ client: c, updWork, upd, go, st }) {
  const A = summary(c, st.market, c.planA), B = summary(c, st.market, c.planB);
  const memoOk = (c.work.memo || '').trim().length >= 10;
  const bz = r => (r.bottom ? `${r.bottom}개월째` : '없음');
  const rows = [
    ['비상자금 바닥', bz(A), bz(B), !!A.bottom, !!B.bottom],
    ['최저 비상자금', `${fmt(A.minMonths, 1)}개월`, `${fmt(B.minMonths, 1)}개월`],
    ['강제 매도', `${fmt(A.forced)}만`, `${fmt(B.forced)}만`, A.forced > 0, B.forced > 0],
    [<>손실 체감액 <small>(한도 {c.psychLimit})</small></>, `${fmt(A.loss)} · ${A.overLimit ? '초과' : '이내'}`, `${fmt(B.loss)} · ${B.overLimit ? '초과' : '이내'}`, A.overLimit, B.overLimit],
    ['목표 달성률', `${fmt(A.goalPct)}%`, `${fmt(B.goalPct)}%`],
  ];
  const sentence = `A안은 ${A.bottom ? `${A.bottom}개월째에 비상자금이 바닥나 ${fmt(A.forced)}만원을 팔아야 하고${A.overLimit ? `, 고객 한도 ${c.psychLimit}만원을 넘습니다` : ''}` : `비상자금이 바닥나지 않지만 최저 ${fmt(A.minMonths, 1)}개월까지 내려갑니다`}. B안은 ${B.bottom ? `${B.bottom}개월째에 바닥납니다` : `바닥 없이 최저 ${fmt(B.minMonths, 1)}개월을 유지합니다`}.`;
  const choose = w => { upd({ adopted: w }); go('record'); };
  const title = Object.entries(c.work.shocks).map(([t, p]) => p.name || SCENARIOS[t].name).join(' + ') || '충격 없음';
  const sub = Object.entries(c.work.shocks).map(([t, p]) => (p.at ? `${p.at}개월 후 시작` : '')).filter(Boolean)[0];
  return (
    <>
      <Head back={() => go('scen')} backLabel="시나리오 선택" title={title} sub={`${sub ? sub + ' · ' : ''}${c.name} · ${c.insurance.monthly > 0 ? '보험 반영' : '보험 미반영'}`} step={4} />
      <section className="pad">
        <div className="card">
          <div className="tr head3"><span /><span className="pillA">A안</span><span className="pillB">B안</span></div>
          {rows.map(([l, a, b, ae, be], i) => <div className="tr res" key={i}><span>{l}</span><b className={ae ? 'err' : ''}>{a}</b><b className={be ? 'err' : 'ok'}>{b}</b></div>)}
          <div className="tr res"><span>최고 경보</span><b><Dot g={A.maxGrade} />{A.grade}</b><b><Dot g={B.maxGrade} />{B.grade}</b></div>
        </div>
        <div className="card"><div className="row between"><p className="ttl">월별 비상자금 잔액</p><span className="legend"><i className="la" />A <i className="lb" />B</span></div>
          <Chart a={A.emgArr} b={B.emgArr} target={c.living * c.emergencyMonths} living={c.living} /></div>
        <div className="row stretch">
          <div className="card flex"><p className="ttl">AI 해설 초안 <small className="tag">AI 초안</small></p><p className="sm">{sentence}</p></div>
          <button className="card sidebtn" onClick={() => go('safety')}><b>안전선 찾기</b><span className="muted">버티려면 최소 얼마?</span></button>
        </div>
        <div className="card memo"><Field label="플래너 판단 메모 · 필수 (10자 이상)"><textarea rows={3} value={c.work.memo} onChange={e => updWork({ memo: e.target.value })} /></Field></div>
        <div className="row two"><button className="chip" onClick={() => go('face')}>대면 모드</button><button className="chip" onClick={() => go('retire')}>노후 전망</button><button className="chip" onClick={() => go('prob')}>확률</button></div>
      </section>
      <Foot>
        <div className="row two"><button className="btn ghost" disabled={!memoOk} onClick={() => choose('A')}>A안 채택</button><button className="btn" disabled={!memoOk} onClick={() => choose('B')}>B안 채택 확정</button></div>
        <button className="link" onClick={() => go('plan')}>B안 다시 수정</button>
      </Foot>
    </>
  );
}

/* ⑤ 설명·확인 기록 */
const RISKS = ['원금 손실 가능성', '시나리오의 한계', '세제 혜택 조건', 'AI 활용 사실'];
export function Record({ client: c, updWork, upd, go, st }) {
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
      <Head back={() => go('result')} backLabel="결과 비교" title="설명·확인 기록" sub={`${c.adopted}안 채택 전 적합성 확인`} step={5} />
      <section className="pad">
        <div className="card"><div className="row between"><span>투자성향</span><b>{c.grade}</b></div><div className="row between"><span>채택안 투자 비중</span><b>{plan.alloc[2]}% (허용 {maxInv}%)</b></div>
          <p className={over ? 'err' : 'ok'}>{over ? '부적합 안입니다. 고객 확인서를 따로 받거나 안을 수정하세요' : '적합'}</p></div>
        <p className="label">설명한 위험 (필수 4개)</p>
        {RISKS.map(x => <label key={x} className="check"><input type="checkbox" checked={r.risks.includes(x)} onChange={e => set({ risks: e.target.checked ? [...r.risks, x] : r.risks.filter(y => y !== x) })} />{x}</label>)}
        <label className="check"><input type="checkbox" checked={r.confirm} onChange={e => set({ confirm: e.target.checked })} />고객이 위 내용을 이해하고 확인함 (필수)</label>
        <Field label="고객 질문 메모 (선택)"><textarea rows={2} value={r.note} onChange={e => set({ note: e.target.value })} /></Field>
      </section>
      <Foot><button className="btn" disabled={!ok} onClick={save}>기록 저장하고 리포트 보기</button></Foot>
    </>
  );
}

/* ⑤-2 리포트 */
export function Report({ client: c, go, st }) {
  const m = st.market;
  const plan = c.adopted === 'A' ? c.planA : c.planB;
  const base = [['충격 없음', []], ['소득 정지 3개월', [['stop', { at: 10 }]]], ['목돈 지출 500', [['lump']]], ['급락 2022형 −35%', [['crash']]]];
  if (c.type === 'variable') base.splice(1, 0, ['소득 감소 −40%', [['cut']]]);
  if (c.loanBal > 0) base.push(['금리 +1%p', [['rate']]]);
  base.push(['소득 정지 + 2022형', [['stop', { at: 10 }], ['crash', { at: 10 }]]]);
  const matrix = base.map(([name, ss]) => {
    const sh = ss.map(([t, o]) => toShock(t, { ...SCENARIOS[t].def, ...o }, m));
    const f = p => run(c, null, p, sh, m);
    return [name, f(c.planA), f(c.planB)];
  });
  const changes = LABEL.map((l, i) => [l === '연금' ? '연금저축' : l, c.planA.alloc[i], c.planB.alloc[i]]).filter(x => x[1] !== x[2]);
  const judges = checkPlan(c, c.planA, m).filter(r => r.flag);
  const fixed = judges.filter(r => c.work.judge[r.id] === 'fix').length;
  const re = c.planB.realloc, reAmt = (re?.invToEmerg || 0) + (re?.invToGoal || 0);
  const riskB = matrix.filter(x => x[2].maxGrade === 3).length;
  return (
    <>
      <Head back={() => go('home')} backLabel="대시보드" title={`검증 리포트 · ${c.name}`} sub={`확정 ${c.work.record?.atISO ? c.work.record.atISO.replace(/-/g, '.') : '-'} · 시장 기준일 ${m.asOf.replace(/-/g, '.')}`} step={6} />
      <section className="pad report">
        {!c.adopted && <p className="warn">아직 채택하지 않았습니다. ④에서 채택을 확정하세요.</p>}
        <div className="adopt"><div><small>채택안</small><h2>{c.adopted || '-'}안 · {c.adopted === 'A' ? 'AI 원안' : '수정안'}</h2></div><div className="r"><small>AI 원안 점검 {judges.length}건</small><b>{judges.length === 0 ? '해당 없음' : fixed === judges.length ? '모두 수정 반영' : `수정 반영 ${fixed}건`}</b></div></div>
        <div className="card"><p className="ttl">A → B 변경점</p><div className="chg">{changes.map(([l, a, b]) => <span key={l}>{l} <b>{a} → {b}%</b></span>)}</div>
          {reAmt > 0 && <p className="sm">투자자산 {reAmt}만 원을 비상자금·목표 예금으로 재배치</p>}</div>
        {judges.length > 0 && <div className="card"><p className="ttl">AI 점검 판정</p>{judges.map(r => <p key={r.id} className="sm">• {r.label}: <b>{c.work.judge[r.id] === 'fix' ? '수정 반영' : c.work.judge[r.id] === 'ok' ? 'AI 맞음' : '미판정'}</b> <span className="muted">({r.detail})</span></p>)}</div>}
        <div className="card"><div className="row between"><p className="ttl">스트레스 매트릭스</p><span className="muted">최고 경보 · 목표 달성률</span></div>
          <div className="tr head3"><span>시나리오</span><span className="pillA">A안</span><span className="pillB">B안</span></div>
          {matrix.map(([n, a, b]) => <div className="tr mx" key={n}><span className="muted">{n}</span><span><Dot g={a.maxGrade} /><b>{a.grade}</b> {fmt(a.goalPct)}%{a.overLimit && <em>한도↑</em>}</span><span><Dot g={b.maxGrade} /><b>{b.grade}</b> {fmt(b.goalPct)}%{b.overLimit && <em>한도↑</em>}</span></div>)}</div>
        {c.work.review?.approvedAt && <div className="card"><p className="ttl">선임 승인</p><p>{c.work.review.role} · {c.work.review.approvedAt}</p></div>}
        {c.work.review?.rejected && <p className="warn">선임 수정 요청: {c.work.review.opinion}</p>}
        {c.aiChosen && <p className="muted">A안 출처: {c.aiChosen} (AI 답변 비교 점검 기록)</p>}
        <div className="card"><p className="ttl">플래너 판단 메모</p><p>{c.work.memo || '-'}</p>
          {c.work.record && <><p className="ttl" style={{ marginTop: 10 }}>설명·확인 기록</p><p className="sm">{c.work.record.risks.join(', ')} · 고객 확인 {c.work.record.confirm ? '완료' : '미완'}</p>{c.work.record.note && <p className="muted">질문: {c.work.record.note}</p>}</>}</div>
        <p className="muted center sm">{riskB > 0 ? `B안도 일부 시나리오에서는 위험 단계 → 모니터링 필요` : 'B안은 모든 시나리오에서 위험 단계를 피합니다'}<br />시장 기준일 {m.asOf.replace(/-/g, '.')} · 투자·연금 수익률은 팀 가정 · 시나리오는 예측이 아닌 비교용</p>
        <div className="row two noprint"><button className="chip" onClick={() => go('history')}>제안 이력</button><button className="chip" onClick={() => window.print()}>PDF 저장</button></div>
      </section>
      <Foot><div className="row two"><button className="btn ghost" onClick={() => go('proposal')}>고객용 제안서</button><button className="btn" onClick={() => go('monitor')}>모니터링 시작</button></div></Foot>
    </>
  );
}
