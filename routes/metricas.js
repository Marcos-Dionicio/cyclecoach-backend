const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/dashboard', auth, async (req, res) => {
  const db = req.app.locals.db;
  const uid = req.usuario.id;

  try {
    const hoje = new Date().toISOString().split('T')[0];
    const metricaHoje = await db.query(
      'SELECT * FROM metricas_diarias WHERE usuario_id=$1 AND data<=$2 ORDER BY data DESC LIMIT 1',
      [uid, hoje]
    );

    const historico = await db.query(`
      SELECT data, ctl, atl, tsb FROM metricas_diarias
      WHERE usuario_id=$1 AND data >= NOW() - INTERVAL '42 days'
      ORDER BY data ASC
    `, [uid]);

    const treinos = await db.query(
      'SELECT * FROM atividades WHERE usuario_id=$1 ORDER BY data DESC LIMIT 10',
      [uid]
    );

    const peso = await db.query(
      'SELECT * FROM pesos_semanais WHERE usuario_id=$1 ORDER BY data_registro DESC LIMIT 1',
      [uid]
    );

    const usuario = await db.query(
      'SELECT nome, objetivo, ftp_estimado, hrmax, peso_inicial FROM usuarios WHERE id=$1',
      [uid]
    );

    // Totais acumulados
    const totais = await db.query(`
      SELECT
        COUNT(*) as total_treinos,
        COALESCE(SUM(distancia_km), 0) as total_km,
        COALESCE(SUM(duracao_min), 0) as total_minutos,
        COALESCE(SUM(tempo_movimento_seg), 0) as total_movimento_seg,
        COALESCE(SUM(elevacao_m), 0) as total_elevacao,
        COALESCE(SUM(tss_calculado), 0) as total_tss
      FROM atividades WHERE usuario_id=$1
    `, [uid]);

    // Médias ponderadas corretas
    const mediasQuery = await db.query(`
      SELECT
        COALESCE(SUM(distancia_km), 0) as total_km,
        COALESCE(SUM(tempo_movimento_seg), 0) as total_mov_seg,
        COALESCE(SUM(cadencia_media * tempo_movimento_seg), 0) as cadencia_ponderada,
        COALESCE(SUM(tempo_movimento_seg) FILTER (WHERE cadencia_media IS NOT NULL), 0) as total_mov_seg_cadencia,
        COALESCE(SUM(fc_media * duracao_min), 0) as fc_ponderada,
        COALESCE(SUM(duracao_min) FILTER (WHERE fc_media IS NOT NULL), 0) as total_min_fc
      FROM atividades WHERE usuario_id=$1
    `, [uid]);

    const md = mediasQuery.rows[0];
    const velocidade_media_mov = md.total_mov_seg > 0
      ? parseFloat((md.total_km / (md.total_mov_seg / 3600)).toFixed(1))
      : null;
    const cadencia_media_pond = md.total_mov_seg_cadencia > 0
      ? Math.round(md.cadencia_ponderada / md.total_mov_seg_cadencia)
      : null;
    const fc_media_pond = md.total_min_fc > 0
      ? Math.round(md.fc_ponderada / md.total_min_fc)
      : null;

    const u = usuario.rows[0];
    const m = metricaHoje.rows[0] || { ctl: 0, atl: 0, tsb: 0 };
    const pesoAtual = peso.rows[0]?.peso_kg || u.peso_inicial || 70;
    const wkg = u.ftp_estimado ? (u.ftp_estimado / pesoAtual).toFixed(2) : 0;

    const insights = gerarInsights(m, u, wkg);
    const zonas = calcularZonas(u.ftp_estimado, u.hrmax);
    const t = totais.rows[0];

    res.json({
      usuario: u,
      metricas: { ...m, wkg },
      historico: historico.rows,
      treinos_recentes: treinos.rows,
      peso_atual: pesoAtual,
      insights,
      zonas,
      totais: {
        treinos: parseInt(t.total_treinos),
        km: parseFloat(t.total_km).toFixed(1),
        horas: (parseInt(t.total_minutos) / 60).toFixed(1),
        elevacao: parseInt(t.total_elevacao),
        tss: parseInt(t.total_tss),
      },
      medias: {
        velocidade_mov: velocidade_media_mov,
        cadencia: cadencia_media_pond,
        fc: fc_media_pond,
      }
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
    insights.push({ tipo: 'atencao', titulo: 'Carga acumulada', texto: `TSB em ${tsb.toFixed(0)}. Você está em zona de construção. Monitore o cansaço.` });
  } else if (tsb >= -5 && tsb <= 10) {
    insights.push({ tipo: 'ok', titulo: 'Bom balanço', texto: 'Você está na zona ideal para treinar com qualidade hoje.' });
  }

  if (ctl > 0) {
    insights.push({ tipo: 'info', titulo: 'Forma atual', texto: `CTL ${ctl.toFixed(0)} — ${ctl < 30 ? 'em construção de base' : ctl < 60 ? 'nível intermediário' : 'boa forma atlética'}.` });
  }

  if (u.objetivo === 'melhorar_ftp') {
    insights.push({ tipo: 'dica', titulo: 'Para subir FTP', texto: 'Faça 2 sessões de Z4 por semana (blocos 2x20min). Mantenha Z2 nos outros dias.' });
  } else if (u.objetivo === 'perder_peso') {
    insights.push({ tipo: 'dica', titulo: 'Para perder peso', texto: 'Rides longos em Z2 maximizam queima de gordura. Alvo: 90min+ por sessão.' });
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