require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Disponibiliza o pool para as rotas
app.locals.db = pool;

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/treinos',  require('./routes/treinos'));
app.use('/api/pesos',    require('./routes/pesos'));
app.use('/api/metricas', require('./routes/metricas'));
app.use('/api/coach',    require('./routes/coach'));

// Rota de health check (Railway usa para verificar se o servidor está rodando)
app.get('/', (req, res) => {
  res.json({ status: 'CycleCoach API rodando!', versao: '1.0.0' });
});

// Inicializa banco de dados e sobe o servidor
async function iniciar() {
  try {
    await pool.query('SELECT 1');
    console.log('Banco de dados conectado!');
    await criarTabelas();
    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  } catch (err) {
    console.error('Erro ao conectar no banco:', err.message);
    process.exit(1);
  }
}

async function criarTabelas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      senha_hash VARCHAR(255) NOT NULL,
      idade INTEGER,
      sexo VARCHAR(20),
      peso_inicial DECIMAL(5,2),
      altura INTEGER,
      objetivo VARCHAR(50),
      nivel VARCHAR(30),
      dias_semana VARCHAR(20),
      ftp_estimado INTEGER,
      hrmax INTEGER,
      criado_em TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pesos_semanais (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      peso_kg DECIMAL(5,2) NOT NULL,
      wkg_calculado DECIMAL(4,2),
      data_registro DATE DEFAULT CURRENT_DATE,
      criado_em TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS atividades (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      nome VARCHAR(150),
      tipo VARCHAR(50) DEFAULT 'Ciclismo',
      data DATE NOT NULL,
      duracao_min INTEGER,
      distancia_km DECIMAL(8,2),
      fc_media INTEGER,
      fc_max INTEGER,
      potencia_media INTEGER,
      potencia_normalizada INTEGER,
      cadencia_media INTEGER,
      elevacao_m INTEGER,
      tss_calculado INTEGER,
      fonte VARCHAR(30) DEFAULT 'manual',
      tempo_movimento_seg INTEGER,
      velocidade_media_mov DECIMAL(6,2),
      cadencia_max INTEGER,
      temperatura_media INTEGER,
      descida_m INTEGER,
      criado_em TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS metricas_diarias (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      data DATE NOT NULL,
      ctl DECIMAL(6,2),
      atl DECIMAL(6,2),
      tsb DECIMAL(6,2),
      tss_do_dia INTEGER DEFAULT 0,
      UNIQUE(usuario_id, data)
    );
  `);
  // Migração — adiciona colunas novas se não existirem
  await pool.query(`
    ALTER TABLE atividades
      ADD COLUMN IF NOT EXISTS tempo_movimento_seg INTEGER,
      ADD COLUMN IF NOT EXISTS velocidade_media_mov DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS cadencia_max INTEGER,
      ADD COLUMN IF NOT EXISTS temperatura_media INTEGER,
      ADD COLUMN IF NOT EXISTS descida_m INTEGER,
      ADD COLUMN IF NOT EXISTS analise_ia TEXT;
  `);
  await pool.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS reset_code VARCHAR(6),
      ADD COLUMN IF NOT EXISTS reset_code_expiry TIMESTAMP;
  `);
  console.log('Tabelas verificadas/criadas!');
}

iniciar();
