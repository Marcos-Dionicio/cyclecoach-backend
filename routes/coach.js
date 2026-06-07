const router = require('express').Router();
const auth = require('../middleware/auth');

// POST /api/coach/perguntar
router.post('/perguntar', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { pergunta } = req.body;

  if (!pergunta) return res.status(400).json({ erro: 'Pergunta nao informada' });

  try {
    // Busca contexto do usuário
    const uRes = await db.query(
      'SELECT nome, objetivo, ftp_estimado, hrmax, idade, peso_inicial FROM usuarios WHERE id=$1',
      [req.usuario.id]
    );
    const u = uRes.rows[0];

    // Busca métricas atuais
    const mRes = await db.query(
      'SELECT ctl, atl, tsb FROM metricas_diarias WHERE usuario_id=$1 ORDER BY data DESC LIMIT 1',
      [req.usuario.id]
    );
    const m = mRes.rows[0] || { ctl: 0, atl: 0, tsb: 0 };

    // Busca último peso
    const pRes = await db.query(
      'SELECT peso_kg, wkg_calculado FROM pesos_semanais WHERE usuario_id=$1 ORDER BY data_registro DESC LIMIT 1',
      [req.usuario.id]
    );
    const p = pRes.rows[0] || { peso_kg: u.peso_inicial, wkg_calculado: null };

    // Busca treinos recentes
    const tRes = await db.query(
      'SELECT nome, tipo, data, duracao_min, distancia_km, tss_calculado FROM atividades WHERE usuario_id=$1 ORDER BY data DESC LIMIT 5',
      [req.usuario.id]
    );

    const contexto = `
Voce e o CycleCoach, um coach de ciclismo especializado e personalizado.

PERFIL DO ATLETA:
- Nome: ${u.nome}
- Idade: ${u.idade} anos
- Objetivo: ${u.objetivo}
- Nivel: intermediario
- FTP estimado: ${u.ftp_estimado}W
- FC maxima: ${u.hrmax} bpm
- Peso atual: ${p.peso_kg}kg
- W/kg: ${p.wkg_calculado || (u.ftp_estimado/u.peso_inicial).toFixed(1)}

METRICAS ATUAIS:
- CTL (Forma): ${parseFloat(m.ctl).toFixed(1)}
- ATL (Fadiga): ${parseFloat(m.atl).toFixed(1)}
- TSB (Balanco): ${parseFloat(m.tsb).toFixed(1)}

TREINOS RECENTES:
${tRes.rows.map(t => `- ${t.nome} (${t.data?.toISOString?.()?.split('T')[0] || t.data}): ${t.duracao_min}min, ${t.distancia_km}km, TSS ${t.tss_calculado}`).join('\n')}

Responda de forma clara, objetiva e personalizada para este atleta. Use os dados reais acima. Maximo 150 palavras.
    `.trim();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: contexto,
        messages: [{ role: 'user', content: pergunta }]
      })
    });

    const data = await response.json();
    const resposta = data.content?.[0]?.text || 'Nao foi possivel gerar resposta. Tente novamente.';

    res.json({ resposta });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
