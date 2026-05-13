import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Ph05112005@2005@db.ntagapzmpwiyeltatlch.supabase.co:5432/postgres'
});

try {
  await client.connect();
  console.log('✅ Conexão com Supabase bem-sucedida!');
  
  const res = await client.query('SELECT NOW()');
  console.log('⏰ Hora do servidor:', res.rows[0].now);
  
  await client.end();
  console.log('✅ Banco de dados está pronto!');
} catch (err) {
  console.error('❌ Erro:', err.message);
  process.exit(1);
}
