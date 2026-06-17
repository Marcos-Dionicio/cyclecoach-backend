const router = require('express').Router();
const auth = require('../middleware/auth');

function calcularFTP(peso, nivel) {
  const base = nivel === 'iniciante' ? 2.0 : nivel === 'intermediario' ? 2.8 : 3.5;
  return Math.round(base * peso);
}

function calcularHRmax(idade, sexo) {
  return sexo === 'Feminino' ? Math.round(206 - 0.88 * idade) : Math.round(208 - 0.7 * idade);
}

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
  const { nome, idade, sexo, peso, altura, objetivo, nivel, dias_semana } = req.body;
  try {
    const current = await db.query(
      'SELECT peso_inicial, ftp_estimado FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    const pesoAtual = current.rows[0]?.peso_inicial;
    const pesoNovo = peso != null ? parseFloat(peso) : null;

    const ftp_estimado = calcularFTP(pesoNovo || parseFloat(pesoAtual) || 70, nivel || 'iniciante');
    const hrmax = calcularHRmax(parseInt(idade) || 30, sexo || 'Masculino');

    const result = await db.query(`
      UPDATE usuarios
      SET nome=$1, idade=$2, sexo=$3, peso_inicial=$4, altura=$5, objetivo=$6, nivel=$7, dias_semana=$8, ftp_estimado=$9, hrmax=$10
      WHERE id=$11
      RETURNING id, nome, email, idade, sexo, peso_inicial, altura, objetivo, nivel, dias_semana, ftp_estimado, hrmax
    `, [nome, idade, sexo, pesoNovo, altura, objetivo, nivel, dias_semana, ftp_estimado, hrmax, req.usuario.id]);

    if (pesoNovo && parseFloat(pesoNovo) !== parseFloat(pesoAtual)) {
      const wkg = (ftp_estimado / pesoNovo).toFixed(2);
      await db.query(
        'INSERT INTO pesos_semanais (usuario_id, peso_kg, wkg_calculado) VALUES ($1,$2,$3)',
        [req.usuario.id, pesoNovo, wkg]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
