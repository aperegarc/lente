import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

console.log("=== TEST DE CONEXIÓN A SUPABASE ===\n");
console.log("Variables cargadas:");
console.log("  SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("  SUPABASE_SERVICE_KEY existe:", !!process.env.SUPABASE_SERVICE_KEY);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.log("\n❌ Faltan variables de entorno");
  console.log("\n💡 Verifica que .env.local existe en:", process.cwd());
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

try {
  const { data, error, count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' });

  if (error) {
    console.log("\n❌ Error:", error.message);
  } else {
    console.log("\n✓ CONEXIÓN OK - Supabase respondiendo");
    console.log("  Registros en 'profiles':", count);
  }
} catch (err) {
  console.log("\n❌ Error de conexión:", err.message);
}

process.exit(0);