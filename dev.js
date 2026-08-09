import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Verificar que las variables se cargaron
console.log('✓ Variables de entorno cargadas:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : '❌');
console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓' : '❌');

// Importar y ejecutar Vercel Dev SIEMPRE en :3000
// (la sesión de Supabase/admin es por origen: localhost:3000 ≠ localhost:3001)
import { spawn } from 'child_process';
import net from 'net';

const PORT = 3000;

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

const free = await canListen(PORT);
if (!free) {
  console.error(`\n❌ El puerto ${PORT} está ocupado.`);
  console.error('Cierra el otro `npm run dev` / terminal y vuelve a intentarlo.');
  console.error('En PowerShell: Get-NetTCPConnection -LocalPort 3000 | % { Stop-Process -Id $_.OwningProcess -Force }\n');
  process.exit(1);
}

const child = spawn('vercel', ['dev', '--listen', String(PORT)], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
