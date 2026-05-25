import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { REPORTS_DIR } from './runs-repo.js';
import { runsErrorHandler, runsRouter } from './routes/runs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, '../..');

const PORT = Number(process.env.PORT ?? 8787);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, reportsDir: REPORTS_DIR, env: NODE_ENV });
});

app.use(runsRouter);

// Serve PixelMatch images (and any future per-run static files).
// express.static is path-traversal-safe by default — it normalizes the
// requested path and refuses to escape its root.
app.use(
  '/reports',
  express.static(REPORTS_DIR, {
    fallthrough: false,
    maxAge: '1h',
    index: false,
  }),
);

// In production, serve the built client (Vite output) and the SPA fallback.
// In dev, Vite serves the client directly on :5173 with a proxy back to us.
if (NODE_ENV === 'production') {
  const clientDist = path.resolve(dashboardRoot, 'dist/client');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(runsErrorHandler);

app.listen(PORT, () => {
  console.log(
    `[dashboard] server listening on http://localhost:${PORT}  ` +
      `(env=${NODE_ENV}, reports=${REPORTS_DIR})`,
  );
});
