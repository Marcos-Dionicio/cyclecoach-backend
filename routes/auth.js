const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// POST /api/auth/cadastro
router.post('/cadastro', async (req, res) => {
  const db = req.app.locals.db;
  const { nome, email, senha, idade, sexo, peso, altura, objetivo, nivel, dias_semana } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
  }

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ erro: 'Email ja cadastrado' });
    }

    const senha_hash = await bcrypt.hash(senha, 10);

    // Calcula FTP estimado e HRmax com base no perfil
    const ftp_estimado = calcularFTP(peso || 70, nivel || 'iniciante');
    const hrmax = calcularHRmax(idade, sexo);

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

// POST /api/auth/esqueci-senha
router.post('/esqueci-senha', async (req, res) => {
  const db = req.app.locals.db;
  const { email } = req.body;

  if (!email) return res.status(400).json({ erro: 'Email é obrigatório' });

  try {
    const result = await db.query('SELECT id, nome FROM usuarios WHERE email = $1', [email]);
    // Retorna 200 mesmo se não encontrar (evita enumeração de emails)
    if (result.rows.length === 0) return res.json({ mensagem: 'Se o email existir, você receberá o código.' });

    const usuario = result.rows[0];
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await db.query(
      'UPDATE usuarios SET reset_code = $1, reset_code_expiry = $2 WHERE id = $3',
      [codigo, expiry, usuario.id]
    );

    await transporter.sendMail({
      from: `"CycleCoach" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Código de recuperação de senha - CycleCoach',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
          <h2 style="color:#1D9E75">🚴 CycleCoach</h2>
          <p>Olá, <strong>${usuario.nome}</strong>!</p>
          <p>Seu código para redefinir a senha é:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1D9E75;text-align:center;padding:20px;background:#f5f5f5;border-radius:8px">
            ${codigo}
          </div>
          <p style="color:#888;font-size:12px;margin-top:16px">Este código expira em 15 minutos. Se você não solicitou a recuperação, ignore este email.</p>
        </div>
      `,
    });

    res.json({ mensagem: 'Se o email existir, você receberá o código.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao enviar email. Tente novamente.' });
  }
});

// POST /api/auth/redefinir-senha
router.post('/redefinir-senha', async (req, res) => {
  const db = req.app.locals.db;
  const { email, codigo, nova_senha } = req.body;

  if (!email || !codigo || !nova_senha) {
    return res.status(400).json({ erro: 'Email, código e nova senha são obrigatórios' });
  }
  if (nova_senha.length < 6) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres' });
  }

  try {
    const result = await db.query(
      'SELECT id, reset_code, reset_code_expiry FROM usuarios WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ erro: 'Código inválido ou expirado' });
    }

    const usuario = result.rows[0];

    if (!usuario.reset_code || usuario.reset_code !== codigo) {
      return res.status(400).json({ erro: 'Código inválido ou expirado' });
    }

    if (new Date() > new Date(usuario.reset_code_expiry)) {
      return res.status(400).json({ erro: 'Código inválido ou expirado' });
    }

    const senha_hash = await bcrypt.hash(nova_senha, 10);
    await db.query(
      'UPDATE usuarios SET senha_hash = $1, reset_code = NULL, reset_code_expiry = NULL WHERE id = $2',
      [senha_hash, usuario.id]
    );

    res.json({ mensagem: 'Senha redefinida com sucesso!' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

function calcularFTP(peso, nivel) {
  const base = nivel === 'iniciante' ? 2.0 : nivel === 'intermediario' ? 2.8 : 3.5;
  return Math.round(base * peso);
}

function calcularHRmax(idade, sexo) {
  const base = sexo === 'Feminino' ? 226 : 220;
  return base - (parseInt(idade) || 30);
}

module.exports = router;
