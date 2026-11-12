import { EXTRACT_PROMPT, GEMINI_SCHEMA, geminiText, normalizeExtraction } from './_parse.js';
import { allow, dailyCap, accessOk } from './_guard.js';

const OK_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'];
const MAX_B64 = 4_000_000; // Vercel 함수 본문 한도(4.5MB) 안
const BUDGET_MS = 52_000; // vercel.json maxDuration(60초) 안에서 응답까지 끝내기 위한 전체 예산
// 기본은 빠르고 정확도가 확인된 lite를 먼저, 막히면(503·429·404·시간 초과) 다음 모델로. GEMINI_MODEL을 지정하면 그 모델만 쓴다.
const DEFAULT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];

const sameOrigin = req => {
  const o = req.headers.origin || req.headers.referer;
  if (!o) return true; // 서버 간 호출·프리뷰는 통과
  try { return new URL(o).host === req.headers.host; } catch { return false; }
};

async function ask(model, key, mime, data, timeoutMs) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: EXTRACT_PROMPT }, { inline_data: { mime_type: mime, data } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'origin' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(501).json({ error: 'not_configured', need: ['GEMINI_API_KEY'] });
  if (!accessOk(req)) return res.status(401).json({ error: 'access', message: '접근 코드가 필요합니다.' });
  const { mime, data } = req.body || {};
  if (!OK_MIME.includes(mime)) return res.status(400).json({ error: 'type', message: 'PDF, 이미지(PNG·JPG·WEBP), 텍스트·CSV만 읽을 수 있습니다.' });
  if (typeof data !== 'string' || !data || data.length > MAX_B64) return res.status(413).json({ error: 'size', message: '파일은 약 3MB 이하여야 합니다.' });
  if (!allow(req, 'extract', 12, 10 * 60_000) || !dailyCap('extract', 300)) return res.status(429).json({ error: 'rate', message: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.' });

  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : DEFAULT_MODELS;
  const deadline = Date.now() + BUDGET_MS;
  let last = { status: 502, message: 'Gemini 호출에 실패했습니다.' };
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    try {
      const { r, j } = await ask(model, key, mime, data, Math.min(25_000, left - 1500));
      if (r.ok) {
        let parsed;
        try { parsed = JSON.parse(geminiText(j)); } catch { last = { status: 502, error: 'parse', message: '읽은 결과를 해석하지 못했습니다. 더 선명한 서류로 다시 시도해 주세요.' }; continue; }
        return res.status(200).json({ ...normalizeExtraction(parsed), model }); // 서류 원문은 저장·기록하지 않는다
      }
      last = { status: 502, error: 'gemini', code: r.status, message: j?.error?.message ? String(j.error.message).slice(0, 200) : 'Gemini 호출에 실패했습니다.' };
      if (![429, 500, 503, 404].includes(r.status)) break; // 키·요청 문제는 다른 모델로 바꿔도 같다
    } catch (e) {
      last = { status: 502, error: 'network', message: e?.name === 'TimeoutError' ? '읽는 데 시간이 너무 오래 걸렸습니다. 잠시 뒤 다시 시도해 주세요.' : 'Gemini에 연결하지 못했습니다.' };
    }
  }
  const { status, ...body } = last;
  return res.status(status).json(body);
}
