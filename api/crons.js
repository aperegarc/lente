// ============================================================
// /api/crons.js — Un solo Serverless Function para todos los crons
// (límite Hobby Vercel: 12 funciones). Rutas antiguas /api/cron/*
// se reescriben aquí vía vercel.json.
// GET/POST ?job=ingest|generate|markets
// ============================================================

import ingest from '../lib/cron/ingest.js';
import generate from '../lib/cron/generate.js';
import marketsYahoo from '../lib/cron/markets.js';

const JOBS = {
  ingest,
  generate,
  markets: marketsYahoo,
};

export default async function handler(req, res) {
  const job = String(req.query?.job || '').trim();
  const fn = JOBS[job];
  if (!fn) {
    return res.status(400).json({
      error: 'Parámetro job inválido o ausente',
      allowed: Object.keys(JOBS),
      hint: 'Ej. /api/crons?job=ingest (Bearer CRON_SECRET)',
    });
  }
  return fn(req, res);
}
