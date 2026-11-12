// 공개 API 남용 방지 (서버리스 인스턴스 단위의 최선 노력 방어)
// 진짜 비용 한도는 Google AI Studio·각 기관의 쿼터/예산 설정으로도 반드시 걸어 두세요.
const hits = new Map();
const day = { d: '', n: {} };

export const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

// windowMs 안에 max회까지
export function allow(req, name, max, windowMs) {
  const now = Date.now(), k = `${name}:${clientIp(req)}`, arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { hits.set(k, arr); return false; }
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(kk);
  return true;
}

// 하루 총량 (인스턴스당)
export function dailyCap(name, max) {
  const d = new Date().toISOString().slice(0, 10);
  if (day.d !== d) { day.d = d; day.n = {}; }
  day.n[name] = (day.n[name] || 0) + 1;
  return day.n[name] <= max;
}

// APP_ACCESS_CODE를 설정하면 코드를 아는 사람만 호출할 수 있다 (선택)
export function accessOk(req) {
  const code = process.env.APP_ACCESS_CODE;
  return !code || req.headers['x-access-code'] === code;
}
