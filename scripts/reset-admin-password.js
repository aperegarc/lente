import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const email = process.argv[2] || 'adrigarciaprz@gmail.com';
const password = process.argv[3] || `Lente-${crypto.randomBytes(4).toString('hex')}`;

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const svc = process.env.SUPABASE_SERVICE_KEY;

if (!url || !anon || !svc) {
  console.error('Faltan variables Supabase en .env.local');
  process.exit(1);
}

const admin = createClient(url, svc, { auth: { persistSession: false } });
const { data: listed, error: le } = await admin.auth.admin.listUsers({ perPage: 100 });
if (le) {
  console.error('listUsers:', le.message);
  process.exit(1);
}

const u = listed.users.find((x) => x.email === email);
if (!u) {
  console.error('Usuario no encontrado:', email);
  process.exit(1);
}

const { error: ue } = await admin.auth.admin.updateUserById(u.id, {
  password,
  email_confirm: true,
});
if (ue) {
  console.error('updateUser:', ue.message);
  process.exit(1);
}

const client = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInWithPassword({ email, password });
if (error) {
  console.error('login_fail:', error.status, error.message);
  process.exit(1);
}

const { data: profile, error: pe } = await admin
  .from('profiles')
  .select('is_admin, email')
  .eq('id', u.id)
  .single();

console.log('OK login');
console.log('EMAIL=' + email);
console.log('PASSWORD=' + password);
console.log('is_admin=' + profile?.is_admin, pe?.message || '');
console.log('user_id=' + u.id);
await client.auth.signOut();
