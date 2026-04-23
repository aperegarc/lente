import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Verificar que las variables se cargaron
console.log('✓ Variables de entorno cargadas:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : '❌');
console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓' : '❌');

// Importar y ejecutar Vercel Dev
import { spawn } from 'child_process';

const child = spawn('vercel', ['dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code);
});