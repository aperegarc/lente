// POST /api/admin/trigger
// Body: { "job": "ingest" | "generate" }
// Invoca el cron en el mismo proceso (sin fetch a sí mismo → funciona en vercel dev).
import { requireAdmin, asCronRequest, createJsonRes } from '../_lib/clients.js';
import ingest from '../../lib/cron/ingest.js';
import generate from '../../lib/cron/generate.js';

const JOBS = { ingest, generate };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  let job;
  try {
    const body = await readJson(req);
    job = body?.job;
  } catch (_) {
    job = undefined;
  }
  if (job !== 'ingest' && job !== 'generate') {
    return res.status(400).json({ error: 'Body debe incluir "job": "ingest" | "generate"' });
  }

  const fn = JOBS[job];
  console.log(`[trigger] ${job} → in-process`);

  try {
    const { res: cronRes, out } = createJsonRes();
    await fn(asCronRequest(req, job), cronRes);
    console.log(`[trigger] ${job} (${out.statusCode}):`, out.body);

    if (out.statusCode >= 400) {
      return res.status(out.statusCode).json({
        ok: false,
        triggered: job,
        error: out.body?.error || `Job ${job} falló`,
        result: out.body,
      });
    }

    return res.status(200).json({ ok: true, triggered: job, result: out.body });
  } catch (err) {
    console.error(`[trigger] ${job}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function readJson(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const { default: getRawBody } = await import('raw-body');
  const buf = await getRawBody(req, { length: req.headers['content-length'], limit: '1mb' });
  const raw = buf.toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}
