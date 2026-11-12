import React, { useEffect, useRef, useState } from 'react';
import { Head, Foot, Status, comma, copyText } from './ui.jsx';
import { buildSchedule } from './Wire.jsx';

const FIELD_ORDER = ['annualRevenue', 'monthlyLiving', 'emergency', 'invest', 'loanBal', 'loanPay', 'hasSonjil', 'incomeProtectionMonthly'];
const LABELS = { annualRevenue: '연 매출', monthlyLiving: '월 고정 생활비', emergency: '비상자금(파킹통장)', invest: '투자자산', loanBal: '대출 잔액', loanPay: '월 대출 상환액', hasSonjil: '실손보험', incomeProtectionMonthly: '소득보상 보장' };
const showVal = it => (it.key === 'hasSonjil' ? (it.value ? '가입' : '없음') : comma(it.value));
const FIXED_NOTE = ' · 고정형은 세후 월급을 직접 확인하세요';

// 접근 코드(APP_ACCESS_CODE)를 쓰는 배포에서만 필요. 한 번 입력하면 이 탭에서 계속 쓴다.
const getCode = () => { try { return sessionStorage.getItem('access') || ''; } catch { return ''; } };
const apiHeaders = (extra = {}) => ({ ...extra, ...(getCode() ? { 'x-access-code': getCode() } : {}) });

// 읽어 온 값 → 고객 정보 입력칸 (체크한 값만)
export function itemsPatch(c, items) {
  const p = {};
  for (const it of items) {
    if (it.key === 'annualRevenue') {
      if (c.type === 'fixed') continue; // 고정형은 세후 월급을 쓰므로 매출·세전 총수입을 그대로 넣지 않는다
      const cur = c.incomeByMonth || {}, vals = Array.from({ length: 12 }, (_, i) => +cur[i + 1] || 0), sum = vals.reduce((a, b) => a + b, 0);
      const out = vals.map(v => (sum > 0 ? Math.round((v * it.value) / sum) : Math.floor(it.value / 12)));
      out[11] += it.value - out.reduce((a, b) => a + b, 0); // 반올림 오차는 마지막 달에 맞춰 연 합계를 지킨다
      p.incomeByMonth = Object.fromEntries(out.map((v, i) => [i + 1, Math.max(0, v)]));
    } else if (it.key === 'monthlyLiving') p.living = it.value;
    else if (it.key === 'hasSonjil') p.sonjil = !!it.value;
    else if (it.key === 'incomeProtectionMonthly') p.insurance = { ...c.insurance, monthly: it.value };
    else p[it.key] = it.value;
  }
  return p;
}

const Check = ({ on }) => <i className={`cb ${on ? 'on' : ''}`} aria-hidden="true" />;

function Found({ items, missing, sel, setSel, note, onSwap, empty }) {
  return (
    <>
      <div className="card"><p className="ttl">{note} · 만 원</p>
        {items.map(it => (
          <div key={it.key} className="fwrap">
            <button className="frow" onClick={() => setSel({ ...sel, [it.key]: !sel[it.key] })} aria-pressed={!!sel[it.key]}>
              <div><span>{it.label}</span><small>{it.evidence}</small></div><b>{showVal(it)}</b><Check on={!!sel[it.key]} />
            </button>
            {(it.alts || []).map((a, i) => <button key={i} className="alt" onClick={() => onSwap(it.key, i)}>다른 서류에서는 {showVal({ ...it, value: a.value })} ({a.evidence}) · 이 값 쓰기</button>)}
          </div>
        ))}
        {items.length === 0 && <p className="muted">{empty || '찾은 값이 없습니다.'}</p>}
      </div>
      {missing.length > 0 && <div className="note2 amber"><b>확인 필요 {missing.length}건</b> {missing.length === 1 && missing[0] === 'incomeProtectionMonthly' ? '소득보상 보장을 서류에서 찾지 못했습니다. 다른 보험이 있는지 고객에게 확인하세요.' : `${missing.map(k => LABELS[k]).join(', ')} 항목은 찾지 못했습니다. 고객에게 확인하세요.`}</div>}
    </>
  );
}

/* ①-1 서류로 자동 입력 (Gemini) */
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv' };
const toB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('read')); r.readAsDataURL(f); });

export function Docs({ client: c, upd, go }) {
  const [files, setFiles] = useState([]), [items, setItems] = useState([]), [sel, setSel] = useState({}), [agree, setAgree] = useState(!!c.consent?.items?.ai);
  const [cfg, setCfg] = useState(null), [needCode, setNeedCode] = useState(false), [code, setCode] = useState('');
  const itemsRef = useRef([]);
  useEffect(() => { fetch('/api/market?status=1').then(r => r.json()).then(j => setCfg(j?.configured ? !!j.configured.gemini : 'err')).catch(() => setCfg('err')); }, []);

  const merge = (name, found) => {
    const cur = itemsRef.current.map(i => ({ ...i, alts: [...(i.alts || [])] })), add = {};
    for (const f of found) {
      const ev = `${name} ${f.evidence}`.trim(), ex = cur.find(i => i.key === f.key), fixedRev = f.key === 'annualRevenue' && c.type === 'fixed';
      if (!ex) { cur.push({ ...f, evidence: ev + (fixedRev ? FIXED_NOTE : ''), alts: [] }); add[f.key] = !fixedRev; }
      else if (ex.value !== f.value) ex.alts.push({ value: f.value, evidence: ev });
    }
    itemsRef.current = cur; setItems(cur); setSel(s => ({ ...s, ...add }));
  };
  const swap = (key, idx) => {
    const cur = itemsRef.current.map(i => ({ ...i, alts: [...(i.alts || [])] })), it = cur.find(i => i.key === key), a = it.alts[idx];
    it.alts[idx] = { value: it.value, evidence: it.evidence }; it.value = a.value; it.evidence = a.evidence;
    itemsRef.current = cur; setItems(cur);
  };
  const setStatus = (id, status, msg) => setFiles(fs => fs.map(f => (f.id === id ? { ...f, status, msg } : f)));
  const pickFiles = async e => {
    const list = [...e.target.files]; e.target.value = ''; setNeedCode(false);
    for (const f of list) {
      const id = `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, ext = f.name.split('.').pop().toLowerCase(), mime = MIME[ext];
      setFiles(fs => [...fs, { id, name: f.name, status: '읽는 중' }]);
      if (/^xlsx?$/.test(ext)) { setStatus(id, '읽기 실패', '엑셀은 CSV로 저장해 올려 주세요'); continue; }
      if (!mime) { setStatus(id, '읽기 실패', 'PDF·이미지·CSV·텍스트만 읽을 수 있어요'); continue; }
      if (f.size > 3_000_000) { setStatus(id, '읽기 실패', '파일은 3MB 이하여야 해요'); continue; }
      try {
        const r = await fetch('/api/extract', { method: 'POST', headers: apiHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ mime, data: await toB64(f) }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 501) { setCfg(false); setStatus(id, '읽기 실패', '서류 읽기를 쓸 수 없어요'); continue; }
        if (r.status === 401) { setNeedCode(true); setStatus(id, '읽기 실패', '접근 코드를 입력한 뒤 다시 올려 주세요'); continue; }
        if (!r.ok) { setStatus(id, '읽기 실패', j.message || '다시 시도해 주세요'); continue; }
        setStatus(id, '읽기 완료'); merge(f.name, j.items || []);
      } catch { setStatus(id, '읽기 실패', '네트워크 오류'); }
    }
  };
  const done = files.some(f => f.status === '읽기 완료');
  const missing = done ? ['annualRevenue', 'monthlyLiving', 'emergency', 'hasSonjil', 'incomeProtectionMonthly'].filter(k => !items.some(i => i.key === k) && !(k === 'annualRevenue' && c.type === 'fixed')) : [];
  const n = items.filter(i => sel[i.key]).length, busy = files.some(f => f.status === '읽는 중');
  return (
    <>
      <Head back={() => go('info')} backLabel="고객" title="서류로 자동 입력" sub="AI가 읽은 값을 확인한 뒤 반영하세요" step={1} />
      <section className="pad">
        {cfg === false && <div className="note2 amber"><b>서류 자동 읽기를 지금은 쓸 수 없습니다</b> 잠시 뒤 다시 시도하거나 직접 입력해 주세요.</div>}
        {cfg === 'err' && <div className="note2 amber"><b>서버 상태를 확인하지 못했습니다</b> 서류를 올려 보거나, 직접 입력해 주세요.</div>}
        {needCode && <div className="card"><p className="ttl">접근 코드</p><div className="row"><input value={code} onChange={e => setCode(e.target.value)} aria-label="접근 코드" /><button className="btn sm" style={{ width: 'auto', margin: 0 }} onClick={() => { try { sessionStorage.setItem('access', code.trim()); } catch {} setNeedCode(false); }}>확인</button></div></div>}
        {!agree && <button className="cbcard" onClick={() => setAgree(true)}><Check on={false} /><div><b>고객이 서류 자동 분석(AI 처리)에 동의했습니다</b><p>동의를 받은 서류만 올려 주세요. 올린 서류는 값을 읽는 데만 쓰이고 저장하지 않습니다.</p></div></button>}
        {agree && cfg !== false && <label className={`upl ${busy ? 'busy' : ''}`}><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" onChange={pickFiles} disabled={busy} /><span>{busy ? '읽는 중…' : '+ 서류 올리기 (PDF·이미지·CSV, 3MB 이하)'}</span></label>}
        {files.length > 0 && <div className="card"><p className="ttl">올린 서류 {files.length}개</p>
          {files.map(f => <div className="drow" key={f.id}><span className="dn">{f.name}</span><b className={f.status === '읽기 완료' ? 'ok' : f.status === '읽기 실패' ? 'err' : 'mut'}>{f.status}</b>{f.msg && <small className="err">{f.msg}</small>}</div>)}</div>}
        {(items.length > 0 || done) && <Found items={items} missing={missing} sel={sel} setSel={setSel} note="AI가 찾은 값" onSwap={swap} empty="서류에서 읽을 수 있는 값을 찾지 못했습니다. 더 선명한 서류를 올리거나 직접 입력해 주세요." />}
        <p className="muted center">체크한 값만 고객 정보에 반영됩니다 · AI 추출값</p>
      </section>
      <Foot><button className="btn" disabled={n === 0} onClick={() => { upd(x => itemsPatch(x, items.filter(i => sel[i.key]))); go('info'); }}>확인한 {n}개 반영</button><button className="link" onClick={() => go('info')}>직접 입력하기</button></Foot>
    </>
  );
}

/* ①-1b 마이데이터 연동 */
const INST = [['bank', '은행', 'A은행·B은행 · 예금·적금 2개'], ['sec', '증권', 'C증권 · ISA·주식 계좌'], ['ins', '보험', 'D보험 · 실손·종신'], ['card', '카드', 'E카드 · 최근 3개월 이용']];
export function MyData({ client: c, upd, go }) {
  const [on, setOn] = useState({ bank: true, sec: true, ins: true, card: false }), [period, setPeriod] = useState('3m'), [step, setStep] = useState('pick'), [sel, setSel] = useState({});
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fixedRev = c.type === 'fixed';
  const items = [
    on.bank && { key: 'annualRevenue', label: '연 매출', value: 4530, evidence: (period === '1y' ? '입금 합계 1년' : '최근 3개월 입금 합계 × 4') + (fixedRev ? FIXED_NOTE : '') },
    on.bank && { key: 'monthlyLiving', label: '월 고정 생활비', value: 248, evidence: `최근 ${period === '1y' ? '12' : '3'}개월 출금 평균` },
    on.bank && { key: 'emergency', label: '비상자금(파킹통장)', value: 600, evidence: '파킹통장 잔액 (A은행)' },
    on.sec && { key: 'invest', label: '투자자산', value: 1000, evidence: 'C증권 주식·ETF 평가액' },
    on.ins && { key: 'hasSonjil', label: '실손보험', value: true, evidence: 'D보험 실손 가입' },
  ].filter(Boolean);
  const missing = on.ins ? ['incomeProtectionMonthly'] : [];
  const usable = on.bank || on.sec || on.ins;
  const connect = () => { setStep('auth'); timer.current = setTimeout(() => { setSel(Object.fromEntries(items.map(i => [i.key, !(i.key === 'annualRevenue' && fixedRev)]))); setStep('done'); }, 1400); };
  const n = items.filter(i => sel[i.key]).length;
  if (step !== 'pick') return (
    <>
      <header className="head"><Status /><div className="row between"><span className="sub">고객 화면 · 상담 준비 링크</span><span className="hr">{step === 'auth' ? '인증 중' : '연결됨'}</span></div>
        <h1>{step === 'auth' ? <>본인 인증 중<br />입니다</> : <>가져온 정보<br />확인하기</>}</h1><p className="sub">{step === 'auth' ? '잠시만 기다려 주세요' : '체크한 값만 고객 정보 초안에 들어갑니다'}</p></header>
      <section className="pad">
        {step === 'auth' ? <div className="card"><p className="muted center">인증하고 기관 정보를 불러오는 중…</p></div>
          : <Found items={items} missing={missing} sel={sel} setSel={setSel} note="마이데이터에서 가져온 값" />}
      </section>
      {step === 'done' && <Foot><button className="btn" disabled={n === 0} onClick={() => { upd(x => itemsPatch(x, items.filter(i => sel[i.key]))); go('info'); }}>확인한 {n}개 반영</button><button className="link" onClick={() => setStep('pick')}>다시 선택하기</button></Foot>}
    </>
  );
  return (
    <>
      <header className="head"><Status /><div className="row between"><span className="sub">고객 화면 · 상담 준비 링크</span><span className="hr">연결</span></div>
        <h1>계좌 정보로<br />한 번에 채우기</h1><p className="sub">서류 대신 금융기관에서 바로 불러옵니다</p></header>
      <section className="pad">
        <div className="card">{INST.map(([k, t, d]) => <button key={k} className="chrow" onClick={() => setOn({ ...on, [k]: !on[k] })} aria-pressed={on[k]}><Check on={on[k]} /><div><b>{t}</b><p>{d}</p></div></button>)}</div>
        <div className="card"><p className="ttl">가져오는 정보</p><p>잔액, 최근 3개월 입출금 합계, 보험 보장 내용</p><p className="muted">거래 상세 내역과 계좌번호 전체는 가져오지 않습니다</p></div>
        <div className="card row between"><span>정보 전송 기간</span><span className="pills sm" style={{ margin: 0 }}>{[['3m', '3개월'], ['1y', '1년']].map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</span></div>
        {!usable && <p className="err">은행·증권·보험 중 하나 이상을 선택해 주세요. 카드는 지출 확인용으로 함께 선택할 수 있습니다.</p>}
      </section>
      <Foot><button className="btn" disabled={!usable} onClick={connect}>본인 인증하고 연결</button><button className="link" onClick={() => go('docs')}>서류로 올릴게요</button></Foot>
    </>
  );
}

/* ⓪-2b 시장 데이터 자동 갱신 */
const pad2 = n => String(n).padStart(2, '0');
const ymLabel = t => `${String(t).slice(0, 4)}.${Number(String(t).slice(4, 6))}`;
const okNum = x => typeof x === 'number' && Number.isFinite(x);

// 최신 상태 s와 서버 응답으로 다음 상태를 만드는 순수 함수 (요청 중에 바뀐 값을 덮어쓰지 않도록 항상 최신 s에 적용)
export function applyMarket(s, data, now = new Date()) {
  const v = data?.values && typeof data.values === 'object' ? data.values : {};
  const m = JSON.parse(JSON.stringify(s.market)), d = `${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`, log = [];
  let big = false, got = 0;
  const set = (k, label, key, src, thr) => {
    const x = v[key];
    if (!x || !okNum(x.value) || x.value < 0 || x.value > 30) return false;
    got++;
    const nv = Math.round(x.value * 100) / 100, old = m[k].value;
    m[k].src = src;
    if (Math.abs(nv - old) >= 0.005) {
      const hit = Math.abs(nv - old) >= thr; if (hit) big = true;
      log.push({ d, t: `${label} ${Number(old).toFixed(2)} → ${nv.toFixed(2)}%`, s: hit ? 'RECHECK' : k === 'cpi' ? '노후 전망 현재가치만 갱신' : '기준 미만 변동 · 경보 변화 0명' });
      m[k].value = nv;
    }
    return true;
  };
  const ok = [
    set('policy', '기준금리', 'policy', `한국은행 · ${ymLabel(v.policy?.time)} 기준`, 0.25),
    set('deposit', '예금 금리', 'deposit', `한국은행 가중평균 · ${ymLabel(v.deposit?.time)} 신규`, 0.25),
    set('loan', '가계대출 금리', 'loan', `한국은행 가중평균 · ${ymLabel(v.loan?.time)} 신규`, 0.25),
    set('cpi', '물가', 'cpi', `KOSIS · ${ymLabel(v.cpi?.time)}`, 0.5),
  ];
  const kx = v.kospi, kOk = kx && okNum(kx.drawdown) && okNum(kx.value);
  if (kOk) { got++; if (kx.drawdown <= -20 && !(s.kospi && s.kospi.drawdown <= -20)) { big = true; log.push({ d, t: `코스피 고점 대비 ${kx.drawdown.toFixed(1)}%`, s: 'RECHECK' }); } }
  const n = s.clients.length, flip = big ? s.clients.filter(c => c.status === 'adopted').length : 0;
  log.forEach(l => { if (l.s === 'RECHECK') l.s = `고객 ${n}명 재계산 · 경보 변화 ${flip}명`; });
  if (ok.every(Boolean)) m.asOf = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`; // 일부만 성공하면 기준일은 그대로 둔다
  const next = { ...s, market: m, lastRefresh: now.toISOString(), kospi: kOk ? kx : s.kospi, marketLog: [...log, ...(Array.isArray(s.marketLog) ? s.marketLog : [])].slice(0, 30),
    clients: big ? s.clients.map(c => (c.status === 'adopted' ? { ...c, status: 'recheck' } : c)) : s.clients };
  return { next, got, log, big, flip };
}

export async function refreshMarket(st, setSt) {
  const fail = (message, extra = {}) => ({ ok: false, message, ...extra });
  const keep = `갱신 실패 · 기준일 ${st.market.asOf.replace(/-/g, '.')} 값 사용 중`;
  try {
    const r = await fetch('/api/market', { headers: apiHeaders() });
    if (r.status === 401) return fail('접근 코드가 필요합니다', { needCode: true });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || typeof data !== 'object') return fail(keep);
    const probe = applyMarket(st, data);
    if (probe.got === 0) return fail(keep, { errors: data.errors && typeof data.errors === 'object' ? data.errors : {} });
    setSt(s => applyMarket(s, data).next);
    return { ok: true, errors: data.errors && typeof data.errors === 'object' ? data.errors : {}, changed: probe.log.length, big: probe.big, flip: probe.flip,
      message: probe.log.length ? `새 값 ${probe.log.length}건을 반영했습니다${probe.big ? ` · 새로 재검증이 필요해진 고객 ${probe.flip}명` : ''}` : '바뀐 값이 없습니다' };
  } catch { return fail(keep); }
}

export const SEED_LOG = [
  { d: '10.22', t: '기준금리 3.00% 동결', s: '변화 없음' },
  { d: '10.29', t: '예금 금리 3.21 → 3.45%', s: '고객 12명 재계산 · 경보 변화 0명' },
  { d: '11.03', t: '물가 2.9 → 2.8%', s: '노후 전망 현재가치만 갱신' },
];
export function Auto({ st, setSt, go }) {
  const [cfg, setCfg] = useState(null), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [code, setCode] = useState('');
  const on = st.settings?.autoRefresh !== false;
  useEffect(() => { fetch('/api/market?status=1').then(r => r.json()).then(j => setCfg(j?.configured || false)).catch(() => setCfg(false)); }, []);
  const last = st.lastRefresh ? new Date(st.lastRefresh) : null, lastStr = last ? `${pad2(last.getMonth() + 1)}.${pad2(last.getDate())} ${pad2(last.getHours())}:${pad2(last.getMinutes())}` : '11.12 09:00';
  const run = async () => { setBusy(true); try { setRes(await refreshMarket(st, setSt)); } finally { setBusy(false); } };
  const need = cfg ? [!cfg.ecos && 'ecos', !cfg.kosis && 'kosis', !cfg.datagokr && 'datagokr'].filter(Boolean) : [];
  const log = Array.isArray(st.marketLog) ? st.marketLog : [];
  return (
    <>
      <Head back={() => go('market')} backLabel="시장 환경" title="시장 데이터 자동 갱신" sub="공식 통계가 바뀌면 고객 시뮬레이션을 다시 계산합니다" right="설정" />
      <section className="pad">
        <div className="card row between"><div><b className="big3">자동 갱신</b><p className="muted">매일 09:00 · 마지막 갱신 {lastStr}</p></div>
          <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label="자동 갱신" onClick={() => setSt(s => ({ ...s, settings: { ...s.settings, autoRefresh: !on } }))}><i /></button></div>
        <div className="card"><p className="ttl">데이터 출처</p>
          {[['기준금리 · 예금·대출 금리', '한국은행 ECOS Open API', cfg?.ecos], ['소비자물가', 'KOSIS 국가통계포털 Open API', cfg?.kosis], ['코스피·코스닥 지수', '공공데이터포털 주식시세 API', cfg?.datagokr]].map(([a, b, ok]) => (
            <div className="kv" key={a}><div><span>{a}</span></div><div className="v">{b}{cfg && <small className={ok ? 'ok' : 'err'}>{ok ? '연결됨' : '연결 안 됨'}</small>}</div></div>))}</div>
        <div className="card"><p className="ttl">재검증 알림 기준</p><p>금리 <b>0.25%p</b> 이상 변동 · 물가 <b>0.5%p</b> 이상 변동</p><p>코스피 직전 고점 대비 <b>−20%</b> 이하</p></div>
        <div className="card"><p className="ttl">변경 기록</p>
          {log.length === 0 && <p className="muted">아직 변경 기록이 없습니다.</p>}
          {log.map((l, i) => <div className="logr" key={i}><b>{l.d}</b><div><b>{l.t}</b><small>{l.s}</small></div></div>)}</div>
        {res && <div className={`note2 ${res.ok ? 'green' : 'amber'}`}><b>{res.ok ? '갱신 완료' : '갱신 실패'}</b> {res.message}{res.errors && Object.keys(res.errors).length > 0 && <small className="block">{Object.entries(res.errors).map(([k, e]) => `${{ policy: '기준금리', deposit: '예금 금리', loan: '대출 금리', cpi: '물가', kospi: '코스피' }[k] || k}: ${/미설정/.test(e) ? '연결 안 됨' : e}`).join(' / ')}</small>}</div>}
        {res?.needCode && <div className="card"><p className="ttl">접근 코드</p><div className="row"><input value={code} onChange={e => setCode(e.target.value)} aria-label="접근 코드" /><button className="btn sm" style={{ width: 'auto', margin: 0 }} onClick={() => { try { sessionStorage.setItem('access', code.trim()); } catch {} setRes(null); }}>확인</button></div></div>}
        {cfg && need.length > 0 && <div className="note2 purple"><b>일부 출처 미연결</b> 연결되지 않은 출처의 값은 갱신되지 않고 기존 값이 그대로 쓰입니다.</div>}
        <p className="muted center">앱을 열 때 하루 한 번(09시 이후) 자동으로 확인하고, 여기서 바로 갱신할 수도 있습니다</p>
      </section>
      <Foot><button className="btn" disabled={busy} onClick={run}>{busy ? '갱신 중…' : '지금 갱신'}</button></Foot>
    </>
  );
}

/* ⓪-3b 알림 보내기 */
export const SEED_OUT = [
  { id: 'o1', d: '11.02', who: '민준', what: '사전 설문 링크', status: '읽음' },
  { id: 'o2', d: '10.28', who: '지호', what: '정기 상담 일정', status: '읽음' },
];
const outStatus = o => { if (o.status) return o.status; const age = Date.now() - (o.at || 0); return age < 2500 ? '예약' : age < 6000 ? '발송됨' : '읽음'; };
export function Notify({ st, setSt, go, nav }) {
  const sched = buildSchedule(st), item = sched.find(x => x.id === nav.arg) || sched.find(x => x.cat === '만기') || sched[0];
  const [ch, setCh] = useState('kakao'), [done, setDone] = useState(false), [copied, setCopied] = useState(null), [, tick] = useState(0);
  const out = Array.isArray(st.outbox) ? st.outbox : SEED_OUT;
  useEffect(() => { if (!out.some(o => outStatus(o) !== '읽음')) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [out]);
  if (!item) return <><Head back={() => go('sched')} backLabel="일정·알림" title="알림 보내기" /><section className="pad"><p className="card muted center">보낼 일정이 없습니다.</p></section></>;
  const cl = item.cid ? st.clients.find(c => c.id === item.cid) : null, who = cl ? cl.name : (item.title || '').split(' ')[0], bulk = !!item.bulk;
  const agreed = st.clients.filter(c => c.consent);
  const consent = item.demo ? { ok: true, txt: '확인 · 11.02' } : bulk ? { ok: agreed.length > 0, txt: `확인된 고객 ${agreed.length}/${st.clients.length}명` } : cl ? { ok: !!cl.consent, txt: cl.consent ? `확인 · ${(cl.consent.at || '').slice(0, 10)}` : '동의 없음' } : { ok: false, txt: '확인 불가' };
  const asOf = st.market.asOf, due = item.due || item.date, days = Math.round((new Date(item.date) - new Date(asOf)) / 864e5), md = `${+due.slice(5, 7)}월 ${+due.slice(8)}일`;
  const tmpl = { 만기: { h: 'ISA 만기 안내', b: `${who} 님, ISA 계좌가 ${md} 만기입니다.\n연금계좌로 옮기면 추가 세액공제를 받을 수 있어요. 상담 일정을 잡아 드릴까요?` },
    세제: { h: '세액공제 마감 안내', b: `${bulk ? '고객님,' : who + ' 님,'} 연말 연금저축·IRP 납입 마감이 다가옵니다.\n올해 세액공제 한도를 확인하고 상담 일정을 잡아 드릴까요?` },
    점검: { h: '정기 점검 안내', b: `${who} 님, ${md} 정기 점검이 예정되어 있어요.\n비상자금 진행률을 함께 확인하고 필요하면 계획을 조정해 드릴게요.` },
    상담: { h: '상담 일정 안내', b: `${who} 님, ${md}${item.time ? ' ' + item.time : ''} 상담이 예정되어 있습니다.\n일정이 어려우시면 편하게 말씀해 주세요.` } }[item.cat || '상담'];
  const text = `[${tmpl.h}] ${tmpl.b.replace(/\n/g, ' ')}`, pending = out.filter(o => outStatus(o) === '예약').length;
  const send = () => {
    const rec = { id: 'o' + Date.now(), at: Date.now(), d: `${pad2(+asOf.slice(5, 7))}.${pad2(+asOf.slice(8))}`, who: bulk ? `동의한 고객 ${agreed.length}명` : who, what: tmpl.h };
    setSt(s => ({ ...s, outbox: [rec, ...(Array.isArray(s.outbox) ? s.outbox : SEED_OUT)].slice(0, 30) })); setDone(true);
  };
  return (
    <>
      <Head back={() => go('sched')} backLabel="일정·알림" title="알림 보내기" sub={item.title.replace(/ · 고객 \d+명/, '')} right={`예약 ${pending}건`} />
      <section className="pad">
        <div className="pills seg2">{[['kakao', '카카오 알림톡'], ['sms', '문자 (대체 발송)']].map(([k, l]) => <button key={k} className={ch === k ? 'on' : ''} onClick={() => setCh(k)}>{l}</button>)}</div>
        {ch === 'kakao' ? (
          <div className="kbox"><small>담당 재무설계사 채널</small><div className="kbub"><div className="kh">{tmpl.h}</div><div className="kb">{tmpl.b.split('\n').map((l, i) => <p key={i}>{l}</p>)}<div className="kbtn">상담 예약하기</div></div></div></div>
        ) : <div className="sbox"><div className="sbub">{tmpl.b.split('\n').map((l, i) => <p key={i}>{l}</p>)}</div><small className="muted">알림톡 발송에 실패하면 이 문자로 대신 보내집니다</small></div>}
        <div className="card">
          <div className="kv"><div><span>수신 동의</span></div><div className={`v ${consent.ok ? 'ok' : 'err'}`}>{consent.txt}</div></div>
          <div className="kv"><div><span>메시지 종류</span></div><div className="v">정보성 ({item.cat === '만기' ? '만기 안내' : item.cat === '세제' ? '세제 안내' : item.cat === '점검' ? '점검 안내' : '일정 안내'})</div></div>
          <div className="kv"><div><span>발송 예약</span></div><div className="v">{item.date.slice(5).replace('-', '.')} 10:00 · {days > 0 ? `D-${days}` : days === 0 ? 'D-Day' : `D+${-days}`}</div></div>
          <div className="kv"><div><span>실패 시</span></div><div className="v">문자로 대체 발송</div></div></div>
        <div className="card"><p className="ttl">발송 기록</p>
          {out.slice(0, 5).map(o => { const s = outStatus(o); return <p className="orow" key={o.id}>{o.d} · {o.who} · {o.what} · <b className={s === '읽음' ? 'ok' : s === '예약' ? 'amb' : 'nv'}>{s}</b></p>; })}</div>
        {!consent.ok && <p className="err">수신 동의가 확인되지 않아 발송할 수 없습니다. 문구만 복사해 직접 안내하세요.</p>}
        {done && <p className="ok center">예약했습니다. 발송 기록에서 상태를 확인하세요.</p>}
      </section>
      <Foot><button className="btn" disabled={!consent.ok || done} onClick={send}>{done ? '예약됨' : '예약 발송'}</button>
        <button className="link" onClick={async () => setCopied((await copyText(text)) ? 'ok' : 'fail')}>{copied === 'ok' ? '복사했습니다' : copied === 'fail' ? '복사하지 못했습니다' : '문구만 복사'}</button></Foot>
    </>
  );
}
