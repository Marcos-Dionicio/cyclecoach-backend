const router = require('express').Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { calcularTSS, calcularTSSporFC, recalcularMetricas } = require('../services/metricas');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/treinos
router.get('/', auth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT * FROM atividades WHERE usuario_id=$1 ORDER BY data DESC LIMIT 50',
      [req.usuario.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/treinos/manual
router.post('/manual', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { nome, tipo, data, duracao_min, distancia_km, fc_media, fc_max, potencia_media, cadencia_media, elevacao_m } = req.body;

  try {
    const uRes = await db.query('SELECT ftp_estimado, hrmax FROM usuarios WHERE id=$1', [req.usuario.id]);
    const { ftp_estimado: ftp, hrmax } = uRes.rows[0];

    const tss = potencia_media
      ? calcularTSS({ duracao_min, potencia_media, ftp })
      : calcularTSSporFC({ duracao_min, fc_media, hrmax });

    const pot_norm = potencia_media ? Math.round(potencia_media * 1.05) : null;

    const result = await db.query(`
      INSERT INTO atividades (usuario_id, nome, tipo, data, duracao_min, distancia_km, fc_media, fc_max, potencia_media, potencia_normalizada, cadencia_media, elevacao_m, tss_calculado, fonte)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual')
      RETURNING *
    `, [req.usuario.id, nome || 'Treino', tipo || 'Ciclismo', data, duracao_min, distancia_km, fc_media, fc_max, potencia_media, pot_norm, cadencia_media, elevacao_m, tss]);

    await recalcularMetricas(db, req.usuario.id);
    res.status(201).json({ treino: result.rows[0], tss_calculado: tss });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/treinos/upload
router.post('/upload', auth, upload.single('arquivo'), async (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.fit') {
      const { Decoder, Stream } = require('@garmin/fitsdk');
      const buffer = fs.readFileSync(req.file.path);
      const stream = Stream.fromBuffer(buffer);
      const decoder = new Decoder(stream);

      if (!decoder.isFIT()) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ erro: 'Arquivo FIT invalido' });
      }

      const { messages } = decoder.read();
      const session = messages.sessionMesgs?.[0] || {};
      const records = messages.recordMesgs || [];

      const uRes = await db.query('SELECT ftp_estimado, hrmax FROM usuarios WHERE id=$1', [req.usuario.id]);
      const { ftp_estimado: ftp, hrmax } = uRes.rows[0];

      const duracao_min = session.totalElapsedTime ? Math.round(session.totalElapsedTime / 60) : 0;
      const distancia_km = session.totalDistance ? parseFloat((session.totalDistance / 1000).toFixed(2)) : 0;
      const fc_media = session.avgHeartRate || null;
      const fc_max = session.maxHeartRate || null;
      const potencia_media = session.avgPower || null;
      const cadencia_media = session.avgCadence || null;
      const elevacao_m = session.totalAscent || null;
      const data_treino = session.startTime
        ? new Date(session.startTime).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      // Verificar duplicado — mesmo usuário, mesma data e mesma duração
      const duplicado = await db.query(
        'SELECT id FROM atividades WHERE usuario_id=$1 AND data=$2 AND duracao_min=$3',
        [req.usuario.id, data_treino, duracao_min]
      );

      if (duplicado.rows.length > 0) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({ erro: 'Este treino já foi importado anteriormente.' });
      }

      const tss = potencia_media
        ? calcularTSS({ duracao_min, potencia_media, ftp })
        : calcularTSSporFC({ duracao_min, fc_media, hrmax });

      const result = await db.query(`
        INSERT INTO atividades (usuario_id, nome, tipo, data, duracao_min, distancia_km, fc_media, fc_max, potencia_media, cadencia_media, elevacao_m, tss_calculado, fonte)
        VALUES ($1,$2,'Ciclismo',$3,$4,$5,$6,$7,$8,$9,$10,$11,'fit')
        RETURNING *
      `, [req.usuario.id, req.file.originalname, data_treino, duracao_min, distancia_km, fc_media, fc_max, potencia_media, cadencia_media, elevacao_m, tss]);

      await recalcularMetricas(db, req.usuario.id);
      fs.unlinkSync(req.file.path);

      res.status(201).json({
        treino: result.rows[0],
        tss_calculado: tss,
        registros: records.length
      });

    } else {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ erro: 'Formato nao suportado. Use .fit' });
    }
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/treinos/:id
router.delete('/:id', auth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM atividades WHERE id=$1 AND usuario_id=$2', [req.params.id, req.usuario.id]);
    await recalcularMetricas(db, req.usuario.id);
    res.json({ mensagem: 'Treino removido' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;