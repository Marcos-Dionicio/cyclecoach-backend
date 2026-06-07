# CycleCoach — Backend

App de análise de treinos de ciclismo com IA.

## Estrutura de arquivos

```
backend/
├── server.js              # Servidor principal
├── .env                   # Variáveis de ambiente (NÃO suba para o GitHub)
├── .gitignore
├── package.json
├── middleware/
│   └── auth.js            # Autenticação JWT
├── routes/
│   ├── auth.js            # Cadastro e login
│   ├── usuarios.js        # Perfil do usuário
│   ├── treinos.js         # Registro manual e upload FIT
│   ├── pesos.js           # Registro semanal de peso
│   ├── metricas.js        # Dashboard e cálculos
│   └── coach.js           # Coach de IA
├── services/
│   └── metricas.js        # Lógica de TSS/CTL/ATL/TSB
└── uploads/               # Arquivos FIT temporários
```

## Instalação local

```bash
npm install
```

Edite o arquivo `.env` com suas credenciais.

```bash
npm run dev
```

Acesse: http://localhost:3000

## Principais endpoints

| Método | Rota                      | Descrição                  |
|--------|---------------------------|----------------------------|
| POST   | /api/auth/cadastro        | Criar conta                |
| POST   | /api/auth/login           | Login                      |
| GET    | /api/usuarios/perfil      | Ver perfil                 |
| POST   | /api/treinos/manual       | Registrar treino manual    |
| POST   | /api/treinos/upload       | Upload arquivo .FIT        |
| POST   | /api/pesos                | Registrar peso semanal     |
| GET    | /api/metricas/dashboard   | Dados completos do painel  |
| POST   | /api/coach/perguntar      | Perguntar ao coach IA      |

## Deploy no Railway

1. Suba o código para o GitHub
2. No Railway: New Project > Deploy from GitHub
3. Adicione um PostgreSQL: New > Database > PostgreSQL
4. Configure as variáveis de ambiente no Railway:
   - DATABASE_URL (gerada automaticamente)
   - JWT_SECRET
   - ANTHROPIC_API_KEY
5. O Railway faz o deploy automaticamente
