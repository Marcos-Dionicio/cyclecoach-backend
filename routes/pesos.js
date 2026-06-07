const router = require('express').Router();
const auth = require('../middleware/auth');

// GET /api/pesos — histórico de pesos
router.get('/', auth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT * FROM pesos_semanais WHERE usuario_id=$1 ORDER BY data_registro DESC LIMIT 52',
      [req.usuario.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/pesos — registrar peso semanal
router.post('/', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { peso_kg } = req.body;

  if (!peso_kg || peso_kg < 30 || peso_kg > 250) {
    return res.status(400).json({ erro: 'Peso invalido. Informe entre 30 e 250 kg.' });
  }

  try {
    const uRes = await db.query('SELECT ftp_estimado FROM usuarios WHERE id=$1', [req.usuario.id]);
    const ftp = uRes.rows[0].ftp_estimado || 0;
    const wkg = ftp > 0 ? (ftp / peso_kg).toFixed(2) : null;

    // Verifica se já registrou hoje
    const hoje = new Date().toISOString().split('T')[0];
    const existe = await db.query(
      'SELECT id FROM pesos_semanais WHERE usuario_id=$1 AND data_registro=$2',
      [req.usuario.id, hoje]
    );

    let result;
    if (existe.rows.length > 0) {
      result = await db.query(
        'UPDATE pesos_semanais SET peso_kg=$1, wkg_calculado=$2 WHERE id=$3 RETURNING *',
        [peso_kg, wkg, existe.rows[0].id]
      );
    } else {
      result = await db.query(
        'INSERT INTO pesos_semanais (usuario_id, peso_kg, wkg_calculado, data_registro) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.usuario.id, peso_kg, wkg, hoje]
      );
    }

    // Verifica variação em relação ao último registro
    const anterior = await db.query(
      'SELECT peso_kg FROM pesos_semanais WHERE usuario_id=$1 AND data_registro < $2 ORDER BY data_registro DESC LIMIT 1',
      [req.usuario.id, hoje]
    );

    let alerta = null;
    if (anterior.rows.length > 0) {
      const variacao = Math.abs(peso_kg - anterior.rows[0].peso_kg);
      if (variacao > 1.5) {
        alerta = `Variacao de ${variacao.toFixed(1)}kg em relacao ao ultimo registro. Fique atento a hidratacao e recuperacao.`;
      }
    }

    res.status(201).json({ peso: result.rows[0], wkg, alerta });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
