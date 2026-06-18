const router = require('express').Router();
const auth = require('../middleware/auth');

function calcularFTP(peso, nivel) {
  const base = nivel === 'iniciante' ? 2.0 : nivel === 'intermediario' ? 2.8 : 3.5;
  return Math.round(base * peso);
}

function calcularHRmax(idade, sexo) {
  const base = sexo === 'Feminino' ? 226 : 220;
  return base - (parseInt(idade) || 30);
}

function calcularNivelPorCTL(ctl) {
  if (ctl == null) return null;
  const c = parseFloat(ctl);
  if (c >= 60) return 'avancado';
  if (c >= 25) return 'intermediario';
  return 'iniciante';
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

    const usuario = result.rows[0];

    const metricaRes = await db.query(
      'SELECT ctl FROM metricas_diarias WHERE usuario_id=$1 AND data <= CURRENT_DATE ORDER BY data DESC LIMIT 1',
      [req.usuario.id]
    );
    const ctl = metricaRes.rows[0]?.ctl ?? null;
    const nivel_calculado = calcularNivelPorCTL(ctl);

    if (nivel_calculado && nivel_calculado !== usuario.nivel) {
      await db.query('UPDATE usuarios SET nivel=$1 WHERE id=$2', [nivel_calculado, req.usuario.id]);
      usuario.nivel = nivel_calculado;
    }

    res.json({ ...usuario, nivel_calculado, ctl_atual: ctl ? parseFloat(ctl).toFixed(1) : null });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/usuarios/perfil
router.put('/perfil', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { nome, idade, sexo, peso, altura, objetivo, dias_semana } = req.body;
  try {
    const current = await db.query(
      'SELECT peso_inicial, ftp_estimado, nivel FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    const pesoAtual = current.rows[0]?.peso_inicial;
    const pesoNovo = peso != null ? parseFloat(peso) : null;

    const metricaRes = await db.query(
      'SELECT ctl FROM metricas_diarias WHERE usuario_id=$1 AND data <= CURRENT_DATE ORDER BY data DESC LIMIT 1',
      [req.usuario.id]
    );
    const ctl = metricaRes.rows[0]?.ctl ?? null;
    const nivelAuto = calcularNivelPorCTL(ctl) || current.rows[0]?.nivel || 'iniciante';

    const ftp_estimado = calcularFTP(pesoNovo || parseFloat(pesoAtual) || 70, nivelAuto);
    const hrmax = calcularHRmax(idade, sexo);

    const result = await db.query(`
      UPDATE usuarios
      SET nome=$1, idade=$2, sexo=$3, peso_inicial=$4, altura=$5, objetivo=$6, nivel=$7, dias_semana=$8, ftp_estimado=$9, hrmax=$10
      WHERE id=$11
      RETURNING id, nome, email, idade, sexo, peso_inicial, altura, objetivo, nivel, dias_semana, ftp_estimado, hrmax
    `, [nome, idade, sexo, pesoNovo, altura, objetivo, nivelAuto, dias_semana, ftp_estimado, hrmax, req.usuario.id]);

    if (pesoNovo && parseFloat(pesoNovo) !== parseFloat(pesoAtual)) {
      const wkg = (ftp_estimado / pesoNovo).toFixed(2);
      await db.query(
        'INSERT INTO pesos_semanais (usuario_id, peso_kg, wkg_calculado) VALUES ($1,$2,$3)',
        [req.usuario.id, pesoNovo, wkg]
      );
    }

    res.json({ ...result.rows[0], nivel_calculado: calcularNivelPorCTL(ctl), ctl_atual: ctl ? parseFloat(ctl).toFixed(1) : null });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
