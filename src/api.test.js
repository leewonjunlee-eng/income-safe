import { normalizeExtraction, geminiText, lastEcos, ecosError, cpiYoy, parseKospi, num } from '../api/_parse.js';
import handler from '../api/extract.js';
import market from '../api/market.js';

let bad = 0;
const eq = (name, got, exp) => { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) { bad++; console.log('FAIL', name, '\n  got', JSON.stringify(got), '\n  exp', JSON.stringify(exp)); } };

// Gemini 결과 정리: 알 수 없는 키·음수·중복·잘못된 타입은 버린다
const ex = normalizeExtraction({ fields: [
  { key: 'annualRevenue', number: 4530.4, evidence: '소득금액증명원 2쪽' }, { key: 'annualRevenue', number: 1, evidence: '중복' },
  { key: 'hasSonjil', flag: true, evidence: '보험증권 1쪽' }, { key: 'emergency', number: -5, evidence: '음수' },
  { key: 'evil', number: 1, evidence: 'x' }, { key: 'invest', number: 'abc', evidence: 'x' }, { key: 'loanBal', number: null, evidence: 'x' } ] });
eq('extract items', ex.items.map(i => [i.key, i.value]), [['annualRevenue', 4530], ['hasSonjil', true]]);
eq('extract missing', ex.missing.includes('incomeProtectionMonthly') && !ex.missing.includes('annualRevenue'), true);
eq('geminiText', geminiText({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] }), '{"a":1}');

// ECOS / KOSIS / 코스피 응답 해석
eq('ecos last', lastEcos({ StatisticSearch: { row: [{ TIME: '202609', DATA_VALUE: '2.9' }, { TIME: '202610', DATA_VALUE: '3.00' }] } }), { value: 3, time: '202610' });
eq('ecos err', ecosError({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }), 'INFO-200 해당하는 데이터가 없습니다.');
const row = (ym, dt, extra = {}) => ({ PRD_DE: ym, DT: String(dt), ITM_NM: '소비자물가지수(총지수)', ITM_ID: 'T', C1: 'T10', ...extra });
eq('cpi from index', cpiYoy([row('202510', 100), row('202511', 101), row('202610', 103), row('202609', 102.5)]), { value: 3, time: '202610' });
eq('cpi missing prev month', cpiYoy([row('202511', 100), row('202610', 103)]), null);
eq('cpi ignores other series', cpiYoy([row('202510', 100, { C1: 'T11' }), row('202510', 50), row('202610', 103)]), { value: 106, time: '202610' });
eq('cpi rate item', cpiYoy([{ PRD_DE: '202610', DT: '2.8', ITM_NM: '전년동월대비 등락률' }]), { value: 2.8, time: '202610' });
eq('strict number', [num('3abc'), num('1,234.5'), num(' 2.5 '), num(null), num(NaN)], [null, null, 2.5, null, null]);
eq('ecos skips bad rows', lastEcos({ StatisticSearch: { row: [{ TIME: '1', DATA_VALUE: '2' }, { TIME: '2', DATA_VALUE: 'x' }] } }), { value: 2, time: '1' });
eq('kospi zero rows', parseKospi({ response: { body: { items: { item: [{ basDt: '20260101', clpr: '0' }] } } } }), null);
eq('extract odd shapes', [normalizeExtraction({ fields: {} }).items.length, normalizeExtraction({ fields: [null, 7, { key: '__proto__' }] }).items.length, normalizeExtraction({ fields: [{ key: 'invest', number: '' }, { key: 'invest', number: true }, { key: 'invest', number: 5e9 }] }).items.length], [0, 0, 0]);
const kj = { response: { body: { items: { item: [{ basDt: '20260105', clpr: '4000' }, { basDt: '20260601', clpr: '5000' }, { basDt: '20261110', clpr: '3900' }] } } } };
eq('kospi', parseKospi(kj), { value: 3900, date: '20261110', peak: 5000, drawdown: -22 });

// 서버 함수: 키가 없으면 "미설정"을 알려 주고 키 값은 내보내지 않는다
const mk = (method, body, query = {}, headers = {}) => { const r = { code: 0, body: null }; return [{ method, body, query, headers }, { status(c) { r.code = c; return this; }, json(o) { r.body = o; return this; } }, r]; };
for (const k of ['GEMINI_API_KEY', 'ECOS_API_KEY', 'KOSIS_API_KEY', 'DATA_GO_KR_KEY']) delete process.env[k];
{ const [rq, rs, r] = mk('POST', { mime: 'application/pdf', data: 'AAAA' }); await handler(rq, rs); eq('extract no key', [r.code, r.body.error], [501, 'not_configured']); }
process.env.GEMINI_API_KEY = 'SECRET-G';
{ const [rq, rs, r] = mk('POST', { mime: 'application/zip', data: 'AAAA' }); await handler(rq, rs); eq('extract bad mime', r.code, 400); }
{ const [rq, rs, r] = mk('POST', { mime: 'application/pdf', data: 'A'.repeat(4_000_001) }); await handler(rq, rs); eq('extract too big', r.code, 413); }
{ const [rq, rs, r] = mk('POST', { mime: 'application/pdf', data: 'AAAA' }, {}, { origin: 'https://evil.example', host: 'income-safe.vercel.app' }); await handler(rq, rs); eq('extract origin', r.code, 403); }
// Gemini를 흉내 내서 끝에서 끝까지
const realFetch = globalThis.fetch; let seen;
globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ fields: [{ key: 'living', number: 1, evidence: 'x' }, { key: 'emergency', number: 600, evidence: '통장 잔액 11.10' }] }) }] } }] }) }; };
{ const [rq, rs, r] = mk('POST', { mime: 'application/pdf', data: 'AAAA' }); await handler(rq, rs);
  eq('extract ok', [r.code, r.body.items], [200, [{ key: 'emergency', label: '비상자금(파킹통장)', value: 600, evidence: '통장 잔액 11.10' }]]);
  eq('key in header not url', [seen.url.includes('SECRET-G'), seen.init.headers['x-goog-api-key']], [false, 'SECRET-G']); }
globalThis.fetch = realFetch;
{ const [rq, rs, r] = mk('GET', null, { status: '1' }); await market(rq, rs); eq('market status', r.body, { configured: { ecos: false, kosis: false, datagokr: false, gemini: true } }); }
{ const [rq, rs, r] = mk('GET'); await market(rq, rs); eq('market no keys', [Object.keys(r.body.values).length, r.body.errors.policy, r.body.errors.cpi, r.body.errors.kospi], [0, 'ECOS_API_KEY 미설정', 'KOSIS_API_KEY 미설정', 'DATA_GO_KR_KEY 미설정']); }


// 남용 방지: 접근 코드, 요청 횟수 제한, 시장 데이터 캐시
process.env.APP_ACCESS_CODE = 'letmein';
{ const [rq, rs, r] = mk('POST', { mime: 'text/plain', data: 'AAAA' }); await handler(rq, rs); eq('access code required', r.code, 401); }
{ const [rq, rs, r] = mk('GET'); await market(rq, rs); eq('market access code', r.code, 401); }
delete process.env.APP_ACCESS_CODE;
{ let code = 0; globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'busy' } }) });
  for (let i = 0; i < 14; i++) { const [rq, rs, r] = mk('POST', { mime: 'text/plain', data: 'AAAA' }, {}, { 'x-forwarded-for': '9.9.9.9' }); await handler(rq, rs); code = r.code; }
  eq('extract rate limit after 12 calls', code, 429); globalThis.fetch = realFetch; }
{ let calls = 0; process.env.ECOS_API_KEY = 'E'; globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ StatisticSearch: { row: [{ TIME: '202610', DATA_VALUE: '3.0' }] } }) }; };
  const fresh = (await import('../api/market.js?fresh')).default; // 모듈 상태(캐시)를 새로 시작
  const a = mk('GET'), b = mk('GET'); await Promise.all([fresh(a[0], a[1]), fresh(b[0], b[1])]); const first = calls; const c2 = mk('GET'); await fresh(c2[0], c2[1]);
  eq('market cache shares/caches', [first, calls], [3, 3]); delete process.env.ECOS_API_KEY; globalThis.fetch = realFetch; }

console.log(bad ? `${bad} API FAIL` : 'API PASS');
process.exit(bad ? 1 : 0);
