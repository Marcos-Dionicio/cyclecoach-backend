const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/auth/cadastro
router.post('/cadastro', async (req, res) => {
  const db = req.app.locals.db;
  const { nome, email, senha, idade, sexo, peso, altura, objetivo, nivel, dias_semana } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha sao obrigatorios' });
  }

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ erro: 'Email ja cadastrado' });
    }

    const senha_hash = await bcrypt.hash(senha, 10);

    // Calcula FTP estimado e HRmax com base no perfil
    const ftp_estimado = calcularFTP(peso || 70, nivel || 'iniciante');
    const hrmax = calcularHRmax(idade || 30, sexo || 'Masculino');

    const result = await db.query(`
      INSERT INTO usuarios (nome, email, senha_hash, idade, sexo, peso_inicial, altura, objetivo, nivel, dias_semana, ftp_estimado, hrmax)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id, nome, email, objetivo, ftp_estimado, hrmax
    `, [nome, email, senha_hash, idade, sexo, peso, altura, objetivo, nivel, dias_semana, ftp_estimado, hrmax]);

    const usuario = result.rows[0];

    // Registra peso inicial se informado
    if (peso) {
      const wkg = (ftp_estimado / peso).toFixed(2);
      await db.query(
        'INSERT INTO pesos_semanais (usuario_id, peso_kg, wkg_calculado) VALUES ($1,$2,$3)',
        [usuario.id, peso, wkg]
      );
    }

    const token = jwt.sign({ id: usuario.id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, usuario });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const db = req.app.locals.db;
  const { email, senha } = req.body;

  try {
    const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ erro: 'Email ou senha incorretos' });
    }

    const usuario = result.rows[0];
    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: 'Email ou senha incorretos' });
    }

    const token = jwt.sign({ id: usuario.id, email: usuario.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    delete usuario.senha_hash;
    res.json({ token, usuario });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

function calcularFTP(peso, nivel) {
  const base = nivel === 'iniciante' ? 2.0 : nivel === 'intermediario' ? 2.8 : 3.5;
  return Math.round(base * peso);
}

function calcularHRmax(idade, sexo) {
  return sexo === 'Feminino' ? Math.round(206 - 0.88 * idade) : Math.round(208 - 0.7 * idade);
}

module.exports = router;
