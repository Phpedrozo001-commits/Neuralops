import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Ph05112005@2005@db.ntagapzmpwiyeltatlch.supabase.co:5432/postgres'
});

try {
  console.log('📡 Conectando ao Supabase...');
  await client.connect();
  console.log('✅ Conectado!');
  
  // Ler arquivo de migrations
  const migrationSQL = fs.readFileSync('./migrations/001_init_schema.sql', 'utf-8');
  
  console.log('🔄 Executando migrations...');
  await client.query(migrationSQL);
  console.log('✅ Migrations executadas com sucesso!');
  
  // Verificar tabelas criadas
  const result = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  
  console.log('\n📊 Tabelas criadas:');
  result.rows.forEach(row => {
    console.log(`  ✓ ${row.table_name}`);
  });
  
  await client.end();
  console.log('\n✅ Banco de dados está pronto para produção!');
  
} catch (err) {
  console.error('❌ Erro:', err.message);
  process.exit(1);
}
