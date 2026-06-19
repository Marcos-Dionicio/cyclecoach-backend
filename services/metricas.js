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

  if (atRes.rows.length === 0) {
    await db.query('DELETE FROM metricas_diarias WHERE usuario_id=$1', [usuario_id]);
    return;
  }

  // Agrupa TSS por dia
  const tssPorDia = {};
  atRes.rows.forEach(a => {
    const d = a.data.toISOString().split('T')[0];
    tssPorDia[d] = (tssPorDia[d] || 0) + (a.tss_calculado || 0);
  });

  // Determina range de datas
  const datas = Object.keys(tssPorDia).sort();
  const inicio = new Date(datas[0]);

  // Remove linhas órfãs antes do primeiro treino (podem existir se o treino mais antigo foi deletado)
  await db.query(
    'DELETE FROM metricas_diarias WHERE usuario_id=$1 AND data < $2',
    [usuario_id, datas[0]]
  );
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

// Calcula a melhor FC média de 20 min a partir dos records do .FIT
// Retorna a FC média arredondada ou null se dados insuficientes
function calcularMelhorFC20min(recordMesgs) {
  const registros = (recordMesgs || [])
    .filter(r => r.heartRate != null && r.timestamp != null)
    .map(r => ({ t: new Date(r.timestamp).getTime(), hr: r.heartRate }))
    .sort((a, b) => a.t - b.t);

  const n = registros.length;
  if (n < 10) return null;

  const duracaoTotal = (registros[n - 1].t - registros[0].t) / 1000;
  if (duracaoTotal < 1200) return null;

  const JANELA_MS = 1200 * 1000;
  const MIN_JANELA_MS = 1140 * 1000;

  let melhorMedia = 0;
  let soma = 0;
  let i = 0;

  for (let j = 0; j < n; j++) {
    soma += registros[j].hr;
    while (i < j && (registros[j].t - registros[i].t) > JANELA_MS) {
      soma -= registros[i].hr;
      i++;
    }
    if ((registros[j].t - registros[i].t) >= MIN_JANELA_MS) {
      const media = soma / (j - i + 1);
      if (media > melhorMedia) melhorMedia = media;
    }
  }

  return melhorMedia > 0 ? Math.round(melhorMedia) : null;
}

// Estima FTP (watts) a partir da melhor FC média de 20 min e peso do atleta
// Só retorna valor se o esforço atingiu limiar mínimo (≥ 85% HRmax)
// Âncoras calibradas com o sistema existente: 85% → 2.0 W/kg, 95% → 3.5 W/kg
// Fator 0.95 aplica conservadorismo em relação à estimativa por potência
function estimarFTPporFC(melhorHR20min, hrmax, peso) {
  if (!melhorHR20min || !hrmax || !peso) return null;
  const hrRatio = melhorHR20min / hrmax;
  if (hrRatio < 0.85) return null;
  const wkg = Math.min(2.0 + (hrRatio - 0.85) * 15, 4.5);
  return Math.round(wkg * peso * 0.95);
}

// Calcula o melhor esforço médio de 20 min a partir dos records do .FIT
// Retorna FTP estimado (melhor_media_20min × 0.95) ou null se dados insuficientes
function calcularMelhorPower20min(recordMesgs) {
  const registros = (recordMesgs || [])
    .filter(r => r.power != null && r.timestamp != null)
    .map(r => ({ t: new Date(r.timestamp).getTime(), p: r.power }))
    .sort((a, b) => a.t - b.t);

  const n = registros.length;
  if (n < 10) return null;

  const duracaoTotal = (registros[n - 1].t - registros[0].t) / 1000;
  if (duracaoTotal < 1200) return null; // menos de 20 min de dados de potência

  const JANELA_MS = 1200 * 1000;     // 20 min exatos
  const MIN_JANELA_MS = 1140 * 1000; // 19 min mínimo (tolerância para intervalos variáveis)

  let melhorMedia = 0;
  let soma = 0;
  let i = 0;

  for (let j = 0; j < n; j++) {
    soma += registros[j].p;

    while (i < j && (registros[j].t - registros[i].t) > JANELA_MS) {
      soma -= registros[i].p;
      i++;
    }

    if ((registros[j].t - registros[i].t) >= MIN_JANELA_MS) {
      const media = soma / (j - i + 1);
      if (media > melhorMedia) melhorMedia = media;
    }
  }

  return melhorMedia > 0 ? Math.round(melhorMedia * 0.95) : null;
}

module.exports = { calcularTSS, calcularTSSporFC, recalcularMetricas, calcularMelhorPower20min, calcularMelhorFC20min, estimarFTPporFC };
