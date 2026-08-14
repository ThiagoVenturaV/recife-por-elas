import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { criarPool } from './db';
import { inicializarAuth } from './auth';
import { registrarRotasAuth } from './auth_rotas';
import { inicializarRegistros, registrarTelemetria } from './registros';
import { inicializarUploads } from './uploads';
import { inicializarArquivos } from './arquivos';
import { estadoDeSaude, registrarInicializacao } from './saude';
import { inicializarBanco, registrarRotas } from './rotas';
import path from 'node:path';

// Porta vem da plataforma (process.env.PORT). Em dev, cai pra 3000.
const PORT = Number(process.env.PORT) || 3000;
// Interface de bind: 127.0.0.1 na Alfaia (só o Nginx alcança); 0.0.0.0 num
// container (export Docker) via HOST. Default seguro = 127.0.0.1.
const HOST = process.env.HOST || '127.0.0.1';

const app = express();

// --- BLINDAGEM DE SEGURANÇA ---
const origensPermitidas = new Set(
  [process.env.ALLOWED_ORIGINS, process.env.APP_BASE_URL]
    .filter(Boolean)
    .flatMap((valor) => String(valor).split(','))
    .map((valor) => valor.trim().replace(/\/$/, ''))
    .filter(Boolean),
);
if (process.env.NODE_ENV !== 'production') {
  origensPermitidas.add('http://localhost:5173');
  origensPermitidas.add('http://127.0.0.1:5173');
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || origensPermitidas.has(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('origem nao permitida'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet({
  hsts: false, // Desabilita o Strict-Transport-Security (HSTS), que força HTTPS
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "http:"],
      upgradeInsecureRequests: null,
    }
  }
}));

const limiterGlobal = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Limite global
  message: { erro: 'Muitas requisições. Tente novamente mais tarde.' }
});
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiterGlobal);
}

const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Anti brute-force e enumeração
  message: { erro: 'Muitas tentativas. Bloqueio temporário por segurança.' }
});
if (process.env.NODE_ENV === 'production') {
  app.use('/api/auth/', limiterAuth);
}
// ------------------------------
// Upload de imagem (GET estático + POST com parser próprio de 8mb) ANTES do json
// global de 1mb — assim só a rota de upload aceita corpos grandes (base64).
inicializarUploads(app);
// Arquivos & mídia (áudio/vídeo gravados, PDF, planilha…): corpo CRU com parser
// próprio (60mb) SÓ na rota /api/arquivos + GET com streaming/Range.
inicializarArquivos(app);
app.use(express.json({ limit: '1mb' }));

// Pool só é criado se houver DATABASE_URL (a plataforma injeta em produção).
const pool = process.env.DATABASE_URL ? criarPool() : null;

// Login seguro embutido (cadastro/entrar/recuperar/redefinir) — tabelas idempotentes.
//
// Toda inicialização essencial passa por registrarInicializacao: se ela falhar,
// o /api/health responde 503 dizendo o quê. Um `.catch(console.error)` aqui já
// deixou uma app ir pro ar com a tabela principal inexistente e health 200.
//
// ⚠️ O registro de ROTAS é feito SEMPRE (fora do bloco condicional), porque a
// plataforma verifica as rotas publicadas e elas precisam existir mesmo que o
// banco ainda esteja subindo. Cada handler protege-se internamente (503 se pool
// for null, igual ao registrarRotasAuth). As inicializações ASSÍNCRONAS (criação
// de tabelas, auth) continuam condicionais ao pool.
if (pool) {
  registrarInicializacao('auth', inicializarAuth(pool));
  registrarInicializacao('registros', inicializarRegistros(pool));
  registrarInicializacao('app', inicializarBanco(pool, process.env.DB_SCHEMA || 'public'));
  // Telemetria ANTES das rotas: middleware loga todo CRUD + endpoint de pageview.
  registrarTelemetria(app, pool);
}

// Rotas SEMPRE registradas — síncronas, não dependem do banco estar pronto.
registrarRotasAuth(app, pool!);
registrarRotas(app, pool!);

// Health: usado pela plataforma pra saber se a app está PRONTA (não só viva).
// 503 enquanto alguma inicialização essencial estiver falhada — é o que impede
// uma app com o banco quebrado de ser dada como publicada.
app.get('/api/health', (_req: Request, res: Response) => {
  const { status, corpo } = estadoDeSaude();
  res.status(status).json(corpo);
});

app.get('/api/info', (_req: Request, res: Response) => {
  res.json({
    app: process.env.APP_SLUG ?? 'projeto',
    env: process.env.NODE_ENV ?? 'development',
    db: pool !== null,
  });
});

// Serve o frontend buildado (modo standalone/Docker — sem Nginx). Na Alfaia é
// inofensivo: o Nginx serve a SPA e o backend só recebe /api.
const distFrontend = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(distFrontend));

// /api não encontrada → 404 JSON; qualquer outra rota → devolve a SPA (roteamento
// no cliente). Nunca HTML de stack.
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ erro: 'rota nao encontrada' });
    return;
  }
  res.sendFile(path.join(distFrontend, 'index.html'), (err) => {
    if (err) res.status(404).json({ erro: 'rota nao encontrada' });
  });
});

// Handler de erro: detalhe no log, genérico pro cliente.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno' });
});

// Escuta em HOST (127.0.0.1 na Alfaia atrás do Nginx; 0.0.0.0 em container).
const server = app.listen(PORT, HOST, () => {
  console.log(`backend ouvindo em http://${HOST}:${PORT}`);
});

// Encerramento gracioso (a plataforma manda SIGTERM ao reiniciar).
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
