import { lastEcos, ecosError, cpiYoy, parseKospi } from './_parse.js';
import { allow, accessOk } from './_guard.js';

// 환경변수 (모두 Vercel 프로젝트 Settings → Environment Variables에 넣으면 된다)
//   ECOS_API_KEY      한국은행 ECOS
//   KOSIS_API_KEY     KOSIS 국가통계포털
//   DATA_GO_KR_KEY    공공데이터포털(금융위원회 지수시세정보)
// 통계 코드는 기본값이 있고, 바꿔야 하면 .env.example의 선택 변수로 덮어쓴다.
const env = (k, d) => process.env[k] || d;
const mask = (s, ...keys) => keys.filter(Boolean).reduce((t, k) => t.split(k).join('***'), String(s));
const ym = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
const ymd = d => `${ym(d)}${String(d.getDate()).padStart(2, '0')}`;
const back = (n, unit = 'm') => { const d = new Date(); unit === 'm' ? d.setMonth(d.getMonth() - n) : d.setDate(d.getDate() - n); return d; };
const getJson = async url => {
  const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    const m = /"returnAuthMsg"\s*:\s*"([^"]+)"/.exec(t) || /<returnAuthMsg>([^<]+)</.exec(t);
    throw new Error(`HTTP ${r.status}${m ? ` · ${m[1]}${/SERVICE_KEY_IS_NOT_REGISTERED/.test(t) ? ' (공공데이터포털에서 이 키로 "금융위원회_지수시세정보" 활용 신청 필요)' : ''}` : ''}`);
  }
  return r.json();
};

async function ecos(stat, item) {
  const key = process.env.ECOS_API_KEY;
  const j = await getJson(`https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/kr/1/12/${stat}/M/${ym(back(8))}/${ym(new Date())}/${item}`);
  const v = lastEcos(j);
  if (!v) throw new Error(ecosError(j) || '값이 없습니다');
  return v;
}

async function kosisCpi() {
  const key = process.env.KOSIS_API_KEY;
  const q = new URLSearchParams({
    method: 'getList', apiKey: key, format: 'json', jsonVD: 'Y', orgId: env('KOSIS_ORG_ID', '101'), tblId: env('KOSIS_TBL_ID', 'DT_1J22003'),
    itmId: env('KOSIS_ITM_ID', 'T'), objL1: env('KOSIS_OBJ_L1', 'T10'), prdSe: 'M', newEstPrdCnt: '14',
  });
  const j = await getJson(`https://kosis.kr/openapi/Param/statisticsParameterData.do?${q}`);
  if (j?.err) throw new Error(`${j.err} ${j.errMsg || ''}`.trim());
  const v = cpiYoy(j, env('KOSIS_IS_RATE', '') === '1');
  if (!v) throw new Error('값이 없습니다');
  return v;
}

async function kospi() {
  const raw = process.env.DATA_GO_KR_KEY, key = raw.includes('%') ? raw : encodeURIComponent(raw); // 인코딩된 키/디코딩된 키 모두 허용
  const url = `https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService/getStockMarketIndex?serviceKey=${key}&resultType=json&numOfRows=300&idxNm=${encodeURIComponent('코스피')}&beginBasDt=${ymd(back(370, 'd'))}`;
  const v = parseKospi(await getJson(url));
  if (!v) throw new Error('값이 없습니다');
  return v;
}

const configured = () => ({ ecos: !!process.env.ECOS_API_KEY, kosis: !!process.env.KOSIS_API_KEY, datagokr: !!process.env.DATA_GO_KR_KEY, gemini: !!process.env.GEMINI_API_KEY });

async function loadAll() {
  const has = configured();
  const jobs = {
    policy: has.ecos && (() => ecos(env('ECOS_POLICY_STAT', '722Y001'), env('ECOS_POLICY_ITEM', '0101000'))),
    deposit: has.ecos && (() => ecos(env('ECOS_DEPOSIT_STAT', '121Y002'), env('ECOS_DEPOSIT_ITEM', 'BEABAA2'))),
    loan: has.ecos && (() => ecos(env('ECOS_LOAN_STAT', '121Y006'), env('ECOS_LOAN_ITEM', 'BECBLA03'))),
    cpi: has.kosis && kosisCpi,
    kospi: has.datagokr && kospi,
  };
  const need = { policy: 'ECOS_API_KEY', deposit: 'ECOS_API_KEY', loan: 'ECOS_API_KEY', cpi: 'KOSIS_API_KEY', kospi: 'DATA_GO_KR_KEY' };
  const secrets = [process.env.ECOS_API_KEY, process.env.KOSIS_API_KEY, process.env.DATA_GO_KR_KEY];
  const names = Object.keys(jobs), values = {}, errors = {};
  const out = await Promise.allSettled(names.map(n => (jobs[n] ? jobs[n]() : Promise.reject(new Error(`${need[n]} 미설정`)))));
  out.forEach((r, i) => { r.status === 'fulfilled' ? (values[names[i]] = r.value) : (errors[names[i]] = mask(r.reason?.message || r.reason, ...secrets)); });
  return { fetchedAt: new Date().toISOString(), values, errors, configured: has };
}

// 같은 값을 여러 사용자가 반복 요청해도 외부 API를 아끼도록 5분 캐시 + 진행 중 요청 공유
let cache = null, inflight = null;
const TTL = 5 * 60_000, TTL_FAIL = 30_000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  if (req.query?.status) return res.status(200).json({ configured: configured() }); // 키 값은 절대 내보내지 않고 설정 여부만
  if (!accessOk(req)) return res.status(401).json({ error: 'access', message: '접근 코드가 필요합니다.' });
  if (!allow(req, 'market', 20, 10 * 60_000)) return res.status(429).json({ error: 'rate', message: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.' });
  const age = cache ? Date.now() - cache.at : Infinity;
  const ttl = cache && Object.keys(cache.data.values).length ? TTL : TTL_FAIL;
  const wantFresh = !!req.query?.force && age > 60_000; // 강제 갱신도 1분에 한 번만
  if (!cache || age > ttl || wantFresh) {
    inflight = inflight || loadAll().finally(() => { inflight = null; });
    cache = { at: Date.now(), data: await inflight };
  }
  return res.status(200).json({ ...cache.data, cachedSeconds: Math.round((Date.now() - cache.at) / 1000) });
}
