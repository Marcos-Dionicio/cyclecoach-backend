import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://cyclecoach-backend-production.up.railway.app';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const auth = {
  cadastro: (dados) => api.post('/api/auth/cadastro', dados),
  login: (email, senha) => api.post('/api/auth/login', { email, senha }),
};

export const metricas = {
  dashboard: () => api.get('/api/metricas/dashboard'),
};

export const treinos = {
  listar: () => api.get('/api/treinos'),
  registrar: (dados) => api.post('/api/treinos/manual', dados),
  excluir: (id) => api.delete(`/api/treinos/${id}`),
};

export const pesos = {
  listar: () => api.get('/api/pesos'),
  registrar: (peso_kg) => api.post('/api/pesos', { peso_kg }),
};

export const coach = {
  perguntar: (pergunta) => api.post('/api/coach/perguntar', { pergunta }),
};

export default api;