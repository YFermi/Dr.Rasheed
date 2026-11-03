// LOCAL DEV ONLY - Vercel uses /api/extract-ideas.ts
import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import extractIdeasHandler from './api/extract-ideas';
import analyzeReferenceHandler from './api/analyze-reference';
import articleOutlineHandler from './api/article/outline';
import articleSectionHandler from './api/article/section';
import articleStitchHandler from './api/article/stitch';
import keyCheckHandler from './api/key-check';

// Loads .env into process.env; variables already set in the shell take precedence.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = express();
app.use(express.json({ limit: '10mb' }));

// Same handler as the Vercel function; it only uses req.method, req.body and
// res.status().json(), which Express provides.
app.post('/api/extract-ideas', (req, res) => extractIdeasHandler(req, res));
app.post('/api/analyze-reference', (req, res) => analyzeReferenceHandler(req, res));
app.post('/api/article/outline', (req, res) => articleOutlineHandler(req, res));
app.post('/api/article/section', (req, res) => articleSectionHandler(req, res));
app.post('/api/article/stitch', (req, res) => articleStitchHandler(req, res));
// Express passes req.headers through, so the X-Gemini-Api-Key header reaches every handler.
app.get('/api/key-check', (req, res) => keyCheckHandler(req, res));
app.post('/api/key-check', (req, res) => keyCheckHandler(req, res));

// Vite integration
if (!isProduction) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist/index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
