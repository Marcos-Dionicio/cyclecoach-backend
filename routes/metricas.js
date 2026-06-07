const router = require('express').Router();
const auth = require('../middleware/auth');

// GET /api/metricas/dashboard — dados completos para o painel
router.get('/dashboard', auth, async (req, res) => {
  const db = req.app.locals.db;
  const uid = req.usuario.id;

  try {
    // Métricas de hoje
    const hoje = new Date().toISOString().split('T')[0];
    const metricaHoje = await db.query(
      'SELECT * FROM metricas_diarias WHERE usuario_id=$1 AND data<=$2 ORDER BY data DESC LIMIT 1',
      [uid, hoje]
    );

    // Últimas 6 semanas de métricas (1 ponto por semana)
    const historico = await db.query(`
      SELECT data, ctl, atl, tsb FROM metricas_diarias
      WHERE usuario_id=$1 AND data >= NOW() - INTERVAL '42 days'
      ORDER BY data ASC
    `, [uid]);

    // Treinos recentes
    const treinos = await db.query(
      'SELECT * FROM atividades WHERE usuario_id=$1 ORDER BY data DESC LIMIT 10',
      [uid]
    );

    // Último peso registrado
    const peso = await db.query(
      'SELECT * FROM pesos_semanais WHERE usuario_id=$1 ORDER BY data_registro DESC LIMIT 1',
      [uid]
    );

    // Perfil do usuário
    const usuario = await db.query(
      'SELECT nome, objetivo, ftp_estimado, hrmax, peso_inicial FROM usuarios WHERE id=$1',
      [uid]
    );

    const u = usuario.rows[0];
    const m = metricaHoje.rows[0] || { ctl: 0, atl: 0, tsb: 0 };
    const pesoAtual = peso.rows[0]?.peso_kg || u.peso_inicial || 70;
    const wkg = u.ftp_estimado ? (u.ftp_estimado / pesoAtual).toFixed(2) : 0;

    // Gera insights automáticos
    const insights = gerarInsights(m, u, wkg);

    // Zonas de treino
    const zonas = calcularZonas(u.ftp_estimado, u.hrmax);

    res.json({
      usuario: u,
      metricas: { ...m, wkg },
      historico: historico.rows,
      treinos_recentes: treinos.rows,
      peso_atual: pesoAtual,
      insights,
      zonas
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

function gerarInsights(m, u, wkg) {
  const insights = [];
  const tsb = parseFloat(m.tsb || 0);
  const ctl = parseFloat(m.ctl || 0);

  if (tsb < -20) {
    insights.push({ tipo: 'alerta', titulo: 'Fadiga elevada', texto: `TSB em ${tsb.toFixed(0)}. Priorize 1-2 dias de recovery antes de treinar intenso.` });
  } else if (tsb < -10) {
    insights.push({ tipo: 'atencao', titulo: 'Carga acumulada', texto: `TSB em ${tsb.toFixed(0)}. Voce esta em zona de construcao. Monitore o cansaco.` });
  } else if (tsb >= -5 && tsb <= 10) {
    insights.push({ tipo: 'ok', titulo: 'Bom balanco', texto: 'Voce esta na zona ideal para treinar com qualidade hoje.' });
  }

  if (ctl > 0) {
    insights.push({ tipo: 'info', titulo: 'Forma atual', texto: `CTL ${ctl.toFixed(0)} — ${ctl < 30 ? 'em construcao de base' : ctl < 60 ? 'nivel intermediario' : 'boa forma atletica'}.` });
  }

  if (u.objetivo === 'melhorar_ftp') {
    insights.push({ tipo: 'dica', titulo: 'Para subir FTP', texto: 'Faca 2 sessoes de Z4 por semana (blocos 2x20min). Mantenha Z2 nos outros dias.' });
  } else if (u.objetivo === 'perder_peso') {
    insights.push({ tipo: 'dica', titulo: 'Para perder peso', texto: 'Rides longos em Z2 maximizam queima de gordura. Alvo: 90min+ por sessao.' });
  }

  return insights;
}

function calcularZonas(ftp, hrmax) {
  if (!ftp) return [];
  return [
    { zona: 'Z1 — Recovery',     potMin: Math.round(ftp*0.45), potMax: Math.round(ftp*0.55), fcMin: Math.round(hrmax*0.50), fcMax: Math.round(hrmax*0.60) },
    { zona: 'Z2 — Base aerobica', potMin: Math.round(ftp*0.56), potMax: Math.round(ftp*0.75), fcMin: Math.round(hrmax*0.60), fcMax: Math.round(hrmax*0.70) },
    { zona: 'Z3 — Tempo',         potMin: Math.round(ftp*0.76), potMax: Math.round(ftp*0.90), fcMin: Math.round(hrmax*0.70), fcMax: Math.round(hrmax*0.80) },
    { zona: 'Z4 — Limiar',        potMin: Math.round(ftp*0.91), potMax: Math.round(ftp*1.05), fcMin: Math.round(hrmax*0.80), fcMax: Math.round(hrmax*0.90) },
    { zona: 'Z5 — VO2 max',       potMin: Math.round(ftp*1.06), potMax: Math.round(ftp*1.20), fcMin: Math.round(hrmax*0.90), fcMax: hrmax },
  ];
}

module.exports = router;
