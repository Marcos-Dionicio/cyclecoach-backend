const router = require('express').Router();
const auth = require('../middleware/auth');

// GET /api/usuarios/perfil
router.get('/perfil', auth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT id, nome, email, idade, sexo, peso_inicial, altura, objetivo, nivel, dias_semana, ftp_estimado, hrmax, criado_em FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/usuarios/perfil
router.put('/perfil', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { nome, idade, sexo, altura, objetivo, nivel, dias_semana } = req.body;
  try {
    const result = await db.query(`
      UPDATE usuarios SET nome=$1, idade=$2, sexo=$3, altura=$4, objetivo=$5, nivel=$6, dias_semana=$7
      WHERE id=$8 RETURNING id, nome, email, objetivo, ftp_estimado, hrmax
    `, [nome, idade, sexo, altura, objetivo, nivel, dias_semana, req.usuario.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
