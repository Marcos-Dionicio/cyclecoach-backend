// Calcula TSS de um treino
function calcularTSS({ duracao_min, potencia_media, ftp }) {
  if (!potencia_media || !ftp || !duracao_min) return 0;
  const np = potencia_media * 1.05; // simplificado
  const if_ = np / ftp;
  const tss = Math.round((duracao_min * 60 * np * if_) / (ftp * 3600) * 100);
  return Math.min(tss, 400); // cap de segurança
}

// Calcula TSS via FC quando não há potência
function calcularTSSporFC({ duracao_min, fc_media, hrmax, ftp }) {
  if (!fc_media || !hrmax) return 0;
  const hrr = fc_media / hrmax;
  const if_ = hrr * 1.1;
  const tss = Math.round((duracao_min / 60) * if_ * if_ * 100);
  return Math.min(tss, 400);
}

// Recalcula CTL, ATL e TSB para um usuário a partir de todas as atividades
async function recalcularMetricas(db, usuario_id) {
  // Busca FTP do usuário
  const uRes = await db.query('SELECT ftp_estimado, hrmax FROM usuarios WHERE id=$1', [usuario_id]);
  const { ftp_estimado: ftp, hrmax } = uRes.rows[0];

  // Busca todas as atividades ordenadas por data
  const atRes = await db.query(
    'SELECT data, tss_calculado FROM atividades WHERE usuario_id=$1 ORDER BY data ASC',
    [usuario_id]
  );

  if (atRes.rows.length === 0) return;

  // Agrupa TSS por dia
  const tssPorDia = {};
  atRes.rows.forEach(a => {
    const d = a.data.toISOString().split('T')[0];
    tssPorDia[d] = (tssPorDia[d] || 0) + (a.tss_calculado || 0);
  });

  // Determina range de datas
  const datas = Object.keys(tssPorDia).sort();
  const inicio = new Date(datas[0]);
  const hoje = new Date();

  let ctl = 0;
  let atl = 0;
  const K_CTL = 1 - Math.exp(-1/42);
  const K_ATL = 1 - Math.exp(-1/7);

  // Itera dia a dia
  const d = new Date(inicio);
  while (d <= hoje) {
    const key = d.toISOString().split('T')[0];
    const tss = tssPorDia[key] || 0;

    ctl = ctl + K_CTL * (tss - ctl);
    atl = atl + K_ATL * (tss - atl);
    const tsb = ctl - atl;

    // Upsert na tabela de métricas
    await db.query(`
      INSERT INTO metricas_diarias (usuario_id, data, ctl, atl, tsb, tss_do_dia)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (usuario_id, data) DO UPDATE SET ctl=$3, atl=$4, tsb=$5, tss_do_dia=$6
    `, [usuario_id, key, ctl.toFixed(2), atl.toFixed(2), tsb.toFixed(2), tss]);

    d.setDate(d.getDate() + 1);
  }
}

module.exports = { calcularTSS, calcularTSSporFC, recalcularMetricas };
