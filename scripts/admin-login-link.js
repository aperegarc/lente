/**
 * Genera un magic link de admin para localhost (sin depender del email).
 * Uso: npm run admin:login
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const email = process.argv[2] || 'adrigarciaprz@gmail.com';
const redirectTo = process.argv[3] || 'http://localhost:3000/admin';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env.local');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo },
});

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

const link = data?.properties?.action_link;
console.log('\n✓ Magic link para', email);
console.log('  Redirect:', redirectTo);
console.log('\nAbre este enlace en el navegador (caduca pronto):\n');
console.log(link);
console.log('\nSi no vuelve a localhost, en Supabase → Authentication → URL Configuration');
console.log('añade: http://localhost:3000/**  y  http://localhost:3000/admin\n');
