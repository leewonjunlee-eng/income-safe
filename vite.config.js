import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev 에서도 /api/* 서버 함수를 그대로 돌려 보기 위한 개발용 미들웨어 (배포에는 쓰이지 않음)
const apiDev = () => ({
  name: 'api-dev',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      const url = new URL(req.url, 'http://localhost');
      try {
        Object.assign(process.env, loadEnv('development', process.cwd(), ''));
        const mod = await server.ssrLoadModule(`${url.pathname}.js`);
        let raw = '';
        for await (const chunk of req) raw += chunk;
        req.body = raw ? JSON.parse(raw) : undefined;
        req.query = Object.fromEntries(url.searchParams);
        res.status = c => { res.statusCode = c; return res; };
        res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
        await mod.default(req, res);
      } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })); }
    });
  },
});

export default defineConfig({ plugins: [react(), apiDev()] });
