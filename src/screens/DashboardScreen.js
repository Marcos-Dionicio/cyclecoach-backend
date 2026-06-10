import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { metricas, treinos } from '../services/api';

const TOOLTIPS = {
  ctl: {
    titulo: 'Forma (CTL)',
    texto: 'Chronic Training Load — média da carga de treino dos últimos 42 dias. Representa seu condicionamento acumulado.',
    recomendado: 'Iniciante: 20–40 | Intermediário: 40–70 | Avançado: 70–100+',
    cor: '#1D9E75',
  },
  atl: {
    titulo: 'Fadiga (ATL)',
    texto: 'Acute Training Load — média da carga dos últimos 7 dias. Reflete o cansaço recente.',
    recomendado: 'Ideal manter entre 1.0–1.5x o CTL. Muito acima = risco de overtraining.',
    cor: '#EF9F27',
  },
  tsb: {
    titulo: 'Balanço (TSB)',
    texto: 'Training Stress Balance = CTL - ATL. Indica se você está descansado ou fatigado.',
    recomendado: '+5 a +20 = ótimo para competir | -10 a 0 = em carga | abaixo de -20 = descanse!',
    cor: '#4a9eff',
  },
  fc: {
    titulo: 'FC média (bpm)',
    texto: 'Frequência cardíaca média dos seus treinos recentes. Medida pela cinta cardíaca.',
    recomendado: 'Treinos de base (Z2): 107–125bpm | Limiar (Z4): 142–160bpm',
    cor: '#E24B4A',
  },
  cadencia: {
    titulo: 'Cadência média (rpm)',
    texto: 'Rotações por minuto do pedal. Cadência eficiente reduz desgaste muscular.',
    recomendado: 'Ideal: 85–95 rpm. Abaixo de 70 = força demais. Acima de 100 = treino específico.',
    cor: '#a78bfa',
  },
  potencia: {
    titulo: 'Potência média (W)',
    texto: 'Watts médios gerados durante os treinos. Base para cálculo de TSS e zonas.',
    recomendado: 'Seu FTP é 210W. Z2: 118–158W | Z4: 191–221W',
    cor: '#f59e0b',
  },
  velocidade: {
    titulo: 'Velocidade média (km/h)',
    texto: 'Velocidade média dos treinos recentes. Varia com terreno, vento e esforço.',
    recomendado: 'Plano: 25–35 km/h | Montanha: 15–22 km/h. Não é o melhor indicador de esforço.',
    cor: '#34d399',
  },
  ftp: {
    titulo: 'FTP — Functional Threshold Power',
    texto: 'A potência máxima que você consegue manter por 1 hora. É a base de tudo — define suas zonas de treino, calcula o TSS e mede sua evolução.',
    recomendado: 'Seu FTP: 210W (2.80 W/kg) | Iniciante: <2.5 W/kg | Recreativo: 2.5–3.5 | Competidor: 3.5–4.5 | Elite: 4.5+',
    cor: '#1D9E75',
  },
};

function TooltipModal({ item, onClose }) {
  if (!item) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalCard}>
          <View style={[styles.modalHeader, { borderLeftColor: item.cor }]}>
            <Text style={styles.modalTitulo}>{item.titulo}</Text>
          </View>
          <Text style={styles.modalTexto}>{item.texto}</Text>
          <View style={styles.modalRec}>
            <Text style={styles.modalRecLabel}>Recomendado</Text>
            <Text style={styles.modalRecVal}>{item.recomendado}</Text>
          </View>
          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseTxt}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function DashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await metricas.dashboard();
      setData(res.data);
    } catch (err) {
      Alert.alert('Erro', 'Nao foi possivel carregar os dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const tsbColor = (tsb) => {
    if (tsb < -20) return '#E24B4A';
    if (tsb < 0) return '#EF9F27';
    return '#1D9E75';
  };

  const excluirTreino = (id, nome) => {
    Alert.alert(
      'Excluir treino',
      `Deseja excluir "${nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await treinos.excluir(id);
              carregar();
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível excluir o treino');
            }
          }
        }
      ]
    );
  };

  if (!data) return (
    <View style={styles.center}>
      <Text style={styles.loading}>Carregando...</Text>
    </View>
  );

  const { metricas: m, insights, zonas, treinos_recentes } = data;

  const mediaFC = () => {
    const t = treinos_recentes?.filter(t => t.fc_media) || [];
    if (!t.length) return null;
    return Math.round(t.reduce((a, t) => a + t.fc_media, 0) / t.length);
  };

  const mediaCadencia = () => {
    const t = treinos_recentes?.filter(t => t.cadencia_media) || [];
    if (!t.length) return null;
    return Math.round(t.reduce((a, t) => a + t.cadencia_media, 0) / t.length);
  };

  const mediaPotencia = () => {
    const t = treinos_recentes?.filter(t => t.potencia_media) || [];
    if (!t.length) return null;
    return Math.round(t.reduce((a, t) => a + t.potencia_media, 0) / t.length);
  };

  const mediaVelocidade = () => {
    const t = treinos_recentes?.filter(t => t.distancia_km && t.duracao_min) || [];
    if (!t.length) return null;
    const media = t.reduce((a, t) => a + (t.distancia_km / (t.duracao_min / 60)), 0) / t.length;
    return media.toFixed(1);
  };

  const StatCard = ({ label, value, unit, tooltipKey }) => (
    <TouchableOpacity style={styles.statCard} onPress={() => setTooltip(TOOLTIPS[tooltipKey])}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statInfo}>ⓘ toque para saber mais</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={carregar} tintColor="#1D9E75" />}>
      <TooltipModal item={tooltip} onClose={() => setTooltip(null)} />

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Ola, {data.usuario?.nome?.split(' ')[0] || 'Ciclista'}!</Text>
          <Text style={styles.subgreeting}>FTP estimado: {data.usuario?.ftp_estimado}W</Text>
        </View>
        <TouchableOpacity style={styles.wkgBadge} onPress={() => setTooltip(TOOLTIPS.ftp)}>
          <Text style={styles.wkgVal}>{m?.wkg}</Text>
          <Text style={styles.wkgLbl}>W/kg</Text>
          <Text style={[styles.statInfo, { color: '#1D9E75' }]}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Carga de treino</Text>
        <View style={styles.statsGrid}>
          <StatCard label="Forma (CTL)" value={parseFloat(m?.ctl || 0).toFixed(0)} unit="pontos" tooltipKey="ctl" />
          <StatCard label="Fadiga (ATL)" value={parseFloat(m?.atl || 0).toFixed(0)} unit="pontos" tooltipKey="atl" />
          <TouchableOpacity style={styles.statCard} onPress={() => setTooltip(TOOLTIPS.tsb)}>
            <Text style={styles.statLabel}>Balanço (TSB)</Text>
            <Text style={[styles.statVal, { color: tsbColor(parseFloat(m?.tsb || 0)) }]}>{parseFloat(m?.tsb || 0).toFixed(0)}</Text>
            <Text style={styles.statUnit}>pontos</Text>
            <Text style={styles.statInfo}>ⓘ toque para saber mais</Text>
          </TouchableOpacity>
        </View>
      </View>

      {(mediaFC() || mediaCadencia() || mediaPotencia() || mediaVelocidade()) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Médias dos treinos recentes</Text>
          <View style={styles.statsGrid}>
            {mediaFC() && <StatCard label="FC média" value={mediaFC()} unit="bpm" tooltipKey="fc" />}
            {mediaCadencia() && <StatCard label="Cadência méd." value={mediaCadencia()} unit="rpm" tooltipKey="cadencia" />}
            {mediaPotencia() && <StatCard label="Potência méd." value={mediaPotencia()} unit="W" tooltipKey="potencia" />}
            {mediaVelocidade() && <StatCard label="Velocidade méd." value={mediaVelocidade()} unit="km/h" tooltipKey="velocidade" />}
          </View>
        </View>
      )}

      {insights?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insights</Text>
          {insights.map((ins, i) => (
            <View key={i} style={styles.insightCard}>
              <Text style={styles.insightTitle}>{ins.titulo}</Text>
              <Text style={styles.insightText}>{ins.texto}</Text>
            </View>
          ))}
        </View>
      )}

      {zonas?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suas zonas de treino</Text>
          {zonas.map((z, i) => (
            <View key={i} style={styles.zonaRow}>
              <Text style={styles.zonaName}>{z.zona}</Text>
              <View style={styles.zonaVals}>
                <Text style={styles.zonaPow}>{z.potMin}–{z.potMax}W</Text>
                {z.fcMin && z.fcMax && (
                  <Text style={styles.zonaFC}>{z.fcMin}–{z.fcMax}bpm</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {treinos_recentes?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Treinos recentes</Text>
          {treinos_recentes.map((t, i) => (
            <View key={i} style={styles.treinoCard}>
              <View style={styles.treinoHeader}>
                <Text style={styles.treinoNome} numberOfLines={1}>{t.nome}</Text>
                <TouchableOpacity onPress={() => excluirTreino(t.id, t.nome)} style={styles.deleteBtn}>
                  <Text style={styles.deleteTxt}>🗑</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.treinoMeta}>
                {t.data} · {t.duracao_min}min · {t.distancia_km}km · TSS {t.tss_calculado}
              </Text>
              <View style={styles.treinoStats}>
                {t.fc_media && (
                  <View style={styles.treinoStat}>
                    <Text style={styles.treinoStatVal}>{t.fc_media}</Text>
                    <Text style={styles.treinoStatLbl}>bpm méd.</Text>
                  </View>
                )}
                {t.fc_max && (
                  <View style={styles.treinoStat}>
                    <Text style={styles.treinoStatVal}>{t.fc_max}</Text>
                    <Text style={styles.treinoStatLbl}>bpm máx.</Text>
                  </View>
                )}
                {t.cadencia_media && (
                  <View style={styles.treinoStat}>
                    <Text style={styles.treinoStatVal}>{t.cadencia_media}</Text>
                    <Text style={styles.treinoStatLbl}>rpm méd.</Text>
                  </View>
                )}
                {t.distancia_km && t.duracao_min && (
                  <View style={styles.treinoStat}>
                    <Text style={styles.treinoStatVal}>{(t.distancia_km / (t.duracao_min / 60)).toFixed(1)}</Text>
                    <Text style={styles.treinoStatLbl}>km/h méd.</Text>
                  </View>
                )}
                {t.elevacao_m && (
                  <View style={styles.treinoStat}>
                    <Text style={styles.treinoStatVal}>{t.elevacao_m}</Text>
                    <Text style={styles.treinoStatLbl}>m elev.</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1117' },
  center: { flex: 1, backgroundColor: '#0F1117', justifyContent: 'center', alignItems: 'center' },
  loading: { color: '#888', fontSize: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60 },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  subgreeting: { fontSize: 13, color: '#888', marginTop: 4 },
  wkgBadge: { backgroundColor: '#1A1D27', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1D9E75' },
  wkgVal: { fontSize: 20, fontWeight: 'bold', color: '#1D9E75' },
  wkgLbl: { fontSize: 11, color: '#888' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '28%', backgroundColor: '#1A1D27', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2A2D37' },
  statLabel: { fontSize: 11, color: '#888', marginBottom: 6 },
  statVal: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  statUnit: { fontSize: 11, color: '#888', marginTop: 2 },
  statInfo: { fontSize: 10, color: '#444', marginTop: 6 },
  section: { paddingHorizontal: 24, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  insightCard: { backgroundColor: '#1A1D27', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2A2D37' },
  insightTitle: { fontSize: 13, fontWeight: '600', color: '#1D9E75', marginBottom: 4 },
  insightText: { fontSize: 13, color: '#aaa', lineHeight: 20 },
  zonaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#2A2D37' },
  zonaName: { fontSize: 13, color: '#ccc' },
  zonaVals: { alignItems: 'flex-end' },
  zonaPow: { fontSize: 13, fontWeight: '600', color: '#fff' },
  zonaFC: { fontSize: 11, color: '#888', marginTop: 2 },
  treinoCard: { backgroundColor: '#1A1D27', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2A2D37' },
  treinoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  treinoNome: { fontSize: 14, fontWeight: '600', color: '#fff', flex: 1 },
  deleteBtn: { padding: 4, marginLeft: 8 },
  deleteTxt: { fontSize: 16 },
  treinoMeta: { fontSize: 12, color: '#888', marginBottom: 10 },
  treinoStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  treinoStat: { alignItems: 'center' },
  treinoStatVal: { fontSize: 16, fontWeight: '600', color: '#1D9E75' },
  treinoStatLbl: { fontSize: 10, color: '#888', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1A1D27', borderRadius: 16, padding: 20, width: '100%', borderWidth: 1, borderColor: '#2A2D37' },
  modalHeader: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 12 },
  modalTitulo: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  modalTexto: { fontSize: 14, color: '#aaa', lineHeight: 22, marginBottom: 14 },
  modalRec: { backgroundColor: '#0F1117', borderRadius: 10, padding: 12, marginBottom: 16 },
  modalRecLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  modalRecVal: { fontSize: 13, color: '#1D9E75', lineHeight: 20 },
  modalClose: { backgroundColor: '#1D9E75', borderRadius: 10, padding: 12, alignItems: 'center' },
  modalCloseTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});