const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:Ph05112005@2005@db.ntagapzmpwiyeltatlch.supabase.co:5432/postgres'
});

client.connect()
  .then(() => {
    console.log('✅ Conexão com Supabase bem-sucedida!');
    return client.query('SELECT NOW()');
  })
  .then(res => {
    console.log('⏰ Hora do servidor:', res.rows[0].now);
    return client.end();
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
