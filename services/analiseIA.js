// Gera uma análise em português comparando um treino com o histórico do atleta
async function gerarAnaliseIA(db, usuario_id, atividade) {
  try {
    const uRes = await db.query(
      'SELECT nome, objetivo, ftp_estimado, hrmax FROM usuarios WHERE id=$1',
      [usuario_id]
    );
    const u = uRes.rows[0];

    const mRes = await db.query(`
      SELECT
        AVG(fc_media) as fc_media,
        AVG(cadencia_media) as cadencia_media,
        AVG(velocidade_media_mov) as velocidade_media_mov,
        AVG(tss_calculado) as tss_calculado
      FROM atividades
      WHERE usuario_id=$1 AND id != $2
    `, [usuario_id, atividade.id]);
    const media = mRes.rows[0];

    const contexto = `
Você é o CycleCoach, um coach de ciclismo especializado e personalizado.

PERFIL DO ATLETA:
- Nome: ${u.nome}
- Objetivo: ${u.objetivo}
- FTP estimado: ${u.ftp_estimado}W
- FC máxima: ${u.hrmax} bpm

TREINO REALIZADO:
- Duração: ${atividade.duracao_min} min
- Distância: ${atividade.distancia_km} km
- FC média: ${atividade.fc_media || '—'} bpm
- Cadência média: ${atividade.cadencia_media || '—'} rpm
- Velocidade média em movimento: ${atividade.velocidade_media_mov || '—'} km/h
- TSS: ${atividade.tss_calculado || '—'}

MÉDIA HISTÓRICA DO ATLETA (treinos anteriores):
- FC média: ${media.fc_media ? parseFloat(media.fc_media).toFixed(0) : '—'} bpm
- Cadência média: ${media.cadencia_media ? parseFloat(media.cadencia_media).toFixed(0) : '—'} rpm
- Velocidade média: ${media.velocidade_media_mov ? parseFloat(media.velocidade_media_mov).toFixed(1) : '—'} km/h
- TSS médio: ${media.tss_calculado ? parseFloat(media.tss_calculado).toFixed(0) : '—'}

Analise este treino comparando com a média histórica do atleta. Destaque o que melhorou, o que piorou e dê uma recomendação prática para o próximo treino. Responda em português, de forma clara e objetiva. Máximo 150 palavras.
    `.trim();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: contexto,
        messages: [{ role: 'user', content: 'Analise este treino.' }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[analiseIA] Anthropic API error:', response.status, JSON.stringify(data));
      return null;
    }
    return data.content?.[0]?.text || null;
  } catch (err) {
    console.error('[analiseIA] erro ao gerar análise:', err.message);
    return null;
  }
}

module.exports = { gerarAnaliseIA };
