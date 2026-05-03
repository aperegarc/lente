// POST /api/admin/trigger
// Body: { "job": "ingest" | "generate" }
import { requireAdmin, getDeploymentUrl } from '../_lib/clients.js';

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

  const path = job === 'ingest' ? '/api/crons?job=ingest' : '/api/crons?job=generate';
  const url = `${getDeploymentUrl(req)}${path}`;
  console.log(`[trigger] ${job} →`, url);

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const data = await response.json();
    console.log(`[trigger] ${job} (${response.status}):`, data);
    return res.status(200).json({ ok: true, triggered: job, result: data });
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
