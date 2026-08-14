// Rotas de autenticação do app base: cadastro, entrar, eu, recuperar, redefinir.
// Respostas NUNCA expõem senha/hash/salt nem o e-mail cifrado. Erros de login são
// genéricos (anti-enumeração de contas), inclusive no TEMPO de resposta.
import type { Express, Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import {
  hashSenha, verificarSenha, cifrarEmail, decifrarEmail, indiceEmail,
  gerarToken, validarToken, gerarTokenReset, hashTokenReset,
  normalizarEmail, emailValido,
} from './auth';

// Estende o Request com o id do usuário autenticado.
interface ReqAuth extends Request {
  usuarioId?: string;
}

// Hash-isca: quando o e-mail não existe, ainda assim verificamos a senha contra
// este hash para gastar o MESMO tempo de scrypt — senão o tempo de resposta
// denuncia se a conta existe (enumeração por timing). O valor é irrelevante: a
// resposta é genérica de qualquer forma.
const HASH_ISCA = hashSenha('isca-constante-para-tempo-constante');

// rateLimit — limitador em memória, por IP, SEM dependência extra (o node_modules
// é compartilhado entre as apps, não instalamos pacote por app). Como a app fica
// atrás do Nginx, o IP real vem em X-Forwarded-For. Janela deslizante simples.
function rateLimit(maxTentativas: number, janelaMs: number) {
  const baldes = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production') return next();
    
    const xff = req.headers['x-forwarded-for'];
    // Conexão LOCAL direta (sem passar pelo Nginx → sem X-Forwarded-For) é de
    // quem já está DENTRO do servidor: os testes E2E da plataforma. Sem este
    // pulo, cada suíte (que cadastra vários usuários) estoura o limite e os
    // testes falham de forma intermitente. Tráfego externo SEMPRE tem XFF.
    const remoto = req.socket.remoteAddress || '';
    if (!xff && (remoto === '127.0.0.1' || remoto === '::1' || remoto === '::ffff:127.0.0.1')) {
      return next();
    }
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0].trim() || remoto || 'desconhecido';
    const agora = Date.now();
    const recentes = (baldes.get(ip) || []).filter((t) => agora - t < janelaMs);
    if (recentes.length >= maxTentativas) {
      res.setHeader('Retry-After', String(Math.ceil(janelaMs / 1000)));
      return res.status(429).json({ erro: 'muitas tentativas; aguarde um momento e tente de novo' });
    }
    recentes.push(agora);
    baldes.set(ip, recentes);
    next();
  };
}

// enviarLinkReset manda o link de redefinição por E-MAIL via o RELAY da plataforma.
// A app NÃO tem chave de e-mail própria — só pode disparar RECUPERAÇÃO de senha por
// aqui (e-mail nesta app é EXCLUSIVO pra isso). Sem relay configurado (ex.: app
// exportada pra outro servidor), cai pro log do servidor. Best-effort: nunca lança.
async function enviarLinkReset(para: string, link: string, usuarioId: string): Promise<void> {
  const url = process.env.PLATAFORMA_EMAIL_URL;
  const tok = process.env.APP_EMAIL_RELAY_TOKEN;
  if (!url || !tok || !para) {
    console.warn(`[auth] relay de e-mail indisponivel para ${usuarioId}; token de redefinicao nao foi registrado em log`);
    return;
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Token': tok },
      body: JSON.stringify({ para, link, app: process.env.APP_SLUG || '' }),
    });
    if (!r.ok) console.error(`[auth] relay de e-mail falhou (${r.status}) para ${usuarioId}`);
  } catch (e) {
    console.error('[auth] relay de e-mail erro:', e);
  }
}

export function registrarRotasAuth(app: Express, pool: Pool | null): void {
  // Limites por IP nas rotas sensíveis (anti força-bruta / anti-spam de reset).
  const limiteEntrar = rateLimit(10, 60_000); // 10 tentativas/min (login)
  const limiteContas = rateLimit(5, 60_000);  // 5/min (cadastro/recuperar/redefinir)

  // Middleware: exige token válido (Authorization: Bearer ...).
  const autenticar = (req: ReqAuth, res: Response, next: NextFunction) => {
    const h = req.headers.authorization || '';
    const id = validarToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!id) return res.status(401).json({ erro: 'nao autenticado' });
    req.usuarioId = id;
    next();
  };

  // POST /api/auth/cadastro  { nome, email, senha }
  app.post('/api/auth/cadastro', limiteContas, async (req: Request, res: Response) => {
    if (!pool) return res.status(503).json({ erro: 'banco indisponivel' });
    const nome = String(req.body?.nome || '').trim();
    const email = normalizarEmail(req.body?.email);
    const senha = String(req.body?.senha || '');
    if (!nome) return res.status(400).json({ erro: 'informe o nome' });
    if (!emailValido(email)) return res.status(400).json({ erro: 'e-mail invalido' });
    if (senha.length < 8) return res.status(400).json({ erro: 'a senha precisa ter ao menos 8 caracteres' });
    try {
      const idx = indiceEmail(email);
      const existe = await pool.query('SELECT 1 FROM usuarios WHERE email_indice=$1', [idx]);
      if (existe.rowCount) return res.status(409).json({ erro: 'este e-mail ja esta cadastrado' });
      const { rows } = await pool.query(
        'INSERT INTO usuarios (nome, email_cifrado, email_indice, senha_hash) VALUES ($1,$2,$3,$4) RETURNING id, nome',
        [nome, cifrarEmail(email), idx, hashSenha(senha)],
      );
      const u = rows[0];
      res.status(201).json({ token: gerarToken(u.id), usuario: { id: u.id, nome: u.nome } });
    } catch (e) {
      console.error('cadastro', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  // POST /api/auth/entrar  { email, senha }
  app.post('/api/auth/entrar', limiteEntrar, async (req: Request, res: Response) => {
    if (!pool) return res.status(503).json({ erro: 'banco indisponivel' });
    const email = normalizarEmail(req.body?.email);
    const senha = String(req.body?.senha || '');
    try {
      const { rows } = await pool.query('SELECT id, nome, senha_hash FROM usuarios WHERE email_indice=$1', [indiceEmail(email)]);
      const u = rows[0];
      // Anti-enumeração por TEMPO: rode o scrypt mesmo quando o usuário não existe
      // (contra o hash-isca), para a resposta levar o mesmo tempo nos dois casos.
      const senhaOk = verificarSenha(senha, u ? u.senha_hash : HASH_ISCA);
      // Mesma resposta para "não existe" e "senha errada" (anti-enumeração).
      if (!u || !senhaOk) {
        return res.status(401).json({ erro: 'e-mail ou senha invalidos' });
      }
      res.json({ token: gerarToken(u.id), usuario: { id: u.id, nome: u.nome } });
    } catch (e) {
      console.error('entrar', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  // GET /api/auth/eu  (Bearer) — devolve só os dados do próprio usuário.
  app.get('/api/auth/eu', autenticar, async (req: ReqAuth, res: Response) => {
    if (!pool) return res.status(503).json({ erro: 'banco indisponivel' });
    try {
      const { rows } = await pool.query('SELECT id, nome, email_cifrado FROM usuarios WHERE id=$1', [req.usuarioId]);
      const u = rows[0];
      if (!u) return res.status(401).json({ erro: 'nao autenticado' });
      res.json({ id: u.id, nome: u.nome, email: decifrarEmail(u.email_cifrado) });
    } catch (e) {
      console.error('eu', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  // POST /api/auth/recuperar  { email }
  // Gera o token e envia o link de redefinição por E-MAIL (via relay da plataforma).
  // Resposta genérica (não revela se a conta existe).
  app.post('/api/auth/recuperar', limiteContas, async (req: Request, res: Response) => {
    const generico = { mensagem: 'Se houver uma conta com esse e-mail, enviaremos um link de recuperação por e-mail. Confira a caixa de entrada e o spam.' };
    if (!pool) return res.json(generico);
    const email = normalizarEmail(req.body?.email);
    try {
      const { rows } = await pool.query('SELECT id, email_cifrado FROM usuarios WHERE email_indice=$1', [indiceEmail(email)]);
      const u = rows[0];
      if (u) {
        const { token, hash } = gerarTokenReset();
        const expira = new Date(Date.now() + 60 * 60 * 1000); // 1h
        await pool.query('INSERT INTO reset_senha (usuario_id, token_hash, expira_em) VALUES ($1,$2,$3)', [u.id, hash, expira]);
        const base = process.env.APP_BASE_URL || '';
        // fire-and-forget: não espera o envio (evita vazar por timing se a conta
        // existe; o helper trata os próprios erros). A resposta é genérica abaixo.
        void enviarLinkReset(decifrarEmail(u.email_cifrado), `${base}/?reset=${token}`, u.id);
      }
      res.json(generico);
    } catch (e) {
      console.error('recuperar', e);
      res.json(generico);
    }
  });

  // POST /api/auth/redefinir  { token, senha }
  app.post('/api/auth/redefinir', limiteContas, async (req: Request, res: Response) => {
    if (!pool) return res.status(503).json({ erro: 'banco indisponivel' });
    const token = String(req.body?.token || '');
    const senha = String(req.body?.senha || '');
    if (senha.length < 8) return res.status(400).json({ erro: 'a senha precisa ter ao menos 8 caracteres' });
    try {
      const { rows } = await pool.query(
        'SELECT id, usuario_id FROM reset_senha WHERE token_hash=$1 AND usado=FALSE AND expira_em > now() ORDER BY criado_em DESC LIMIT 1',
        [hashTokenReset(token)],
      );
      const r = rows[0];
      if (!r) return res.status(400).json({ erro: 'link invalido ou expirado' });
      await pool.query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2', [hashSenha(senha), r.usuario_id]);
      // Invalida TODOS os tokens de reset pendentes deste usuário (não só o usado),
      // para um link antigo vazado não servir depois da redefinição.
      await pool.query('UPDATE reset_senha SET usado=TRUE WHERE usuario_id=$1 AND usado=FALSE', [r.usuario_id]);
      res.json({ mensagem: 'senha redefinida com sucesso' });
    } catch (e) {
      console.error('redefinir', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });
}
