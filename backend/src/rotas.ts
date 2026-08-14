// Rotas da aplicação Recife Por Elas: oportunidades, candidaturas, mural, perfil.
// Toda rota de dado do usuário exige token (401 sem token) e filtra por
// usuario_id do TOKEN - nunca um id vindo do cliente.
import type { Express, Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { validarToken, decifrarEmail } from './auth';
import { unificarOportunidadesExternas } from './integracoes';
import crypto from 'node:crypto';

interface ReqAuth extends Request {
  usuarioId?: string;
}

let _pool: Pool | null = null;
let _schema = '';

type MuralTipo = 'postagem' | 'pedido';

function isMuralTipo(valor: unknown): valor is MuralTipo {
  return valor === 'postagem' || valor === 'pedido';
}

export function poolAtual(): Pool | null {
  return _pool;
}

function autenticar(req: ReqAuth, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const id = validarToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!id) return res.status(401).json({ erro: 'não autenticado' });
  req.usuarioId = id;
  next();
}

function normalizarCurtidas<T extends { likes_count?: unknown; comments_count?: unknown; me_liked?: unknown }>(rows: T[]) {
  return rows.map((row) => ({
    ...row,
    likes_count: Number(row.likes_count || 0),
    comments_count: Number(row.comments_count || 0),
    me_liked: Boolean(row.me_liked),
  }));
}

export async function inicializarBanco(pool: Pool, schema: string): Promise<void> {
  _pool = pool;
  _schema = schema;

  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oportunidade (
      id              SERIAL PRIMARY KEY,
      titulo          TEXT NOT NULL,
      descricao       TEXT NOT NULL,
      tipo            TEXT NOT NULL CHECK (tipo IN ('Emprego','Curso','Benefício social','Microcrédito')),
      fonte           TEXT NOT NULL,
      link_inscricao  TEXT DEFAULT '',
      bairro          TEXT DEFAULT '',
      endereco        TEXT DEFAULT '',
      latitude        DOUBLE PRECISION,
      longitude       DOUBLE PRECISION,
      horario         TEXT DEFAULT '',
      data_inicio_inscricao DATE,
      data_fim_inscricao    DATE
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipamentos_locais (
      id         VARCHAR PRIMARY KEY,
      nome       VARCHAR,
      categoria  VARCHAR,
      endereco   TEXT,
      bairro     TEXT,
      telefone   TEXT,
      horario_funcionamento TEXT,
      latitude   NUMERIC,
      longitude  NUMERIC,
      fonte_dados VARCHAR DEFAULT 'desconhecida',
      verificado_manualmente BOOLEAN DEFAULT false,
      ativo      BOOLEAN DEFAULT true,
      dados_brutos JSONB,
      atualizado_em TIMESTAMPTZ DEFAULT now(),
      criado_em  TIMESTAMPTZ DEFAULT now()
    )`);

  await pool.query(`ALTER TABLE equipamentos_locais ADD COLUMN IF NOT EXISTS dados_brutos JSONB`);



  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidatura (
      id               SERIAL PRIMARY KEY,
      usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      oportunidade_id  INTEGER NOT NULL REFERENCES oportunidade(id) ON DELETE CASCADE,
      data_candidatura TIMESTAMPTZ NOT NULL DEFAULT now(),
      mensagem         TEXT DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'Enviada' CHECK (status IN ('Enviada','Em análise','Aprovada','Não selecionada')),
      UNIQUE(usuario_id, oportunidade_id)
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensagem_mural (
      id              SERIAL PRIMARY KEY,
      bairro          TEXT NOT NULL,
      autor_nome      TEXT NOT NULL,
      texto           TEXT NOT NULL,
      data_publicacao TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS perfil (
      usuario_id      UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      telefone        TEXT DEFAULT '',
      cpf             TEXT DEFAULT '',
      data_nascimento TEXT DEFAULT '',
      bairro          TEXT DEFAULT '',
      filhos          INTEGER DEFAULT 0,
      idades_filhos   TEXT DEFAULT '',
      turno_disponivel TEXT DEFAULT '',
      interesses      TEXT DEFAULT '',
      photo_url       TEXT DEFAULT ''
    )`);

  await pool.query(`
    ALTER TABLE perfil
    ADD COLUMN IF NOT EXISTS sobre_mim TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS experiencias TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS cursos TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS habilidades TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mural_posts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      autor_nome  TEXT NOT NULL,
      bairro      TEXT NOT NULL,
      tipo        TEXT NOT NULL DEFAULT 'postagem' CHECK (tipo IN ('postagem','pedido')),
      categoria   TEXT NOT NULL DEFAULT '',
      media_url   TEXT NOT NULL DEFAULT '',
      media_tipo  TEXT NOT NULL DEFAULT '',
      media_nome  TEXT NOT NULL DEFAULT '',
      texto       TEXT NOT NULL,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await pool.query(`
    ALTER TABLE mural_posts
    ADD COLUMN IF NOT EXISTS media_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS media_tipo TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS media_nome TEXT NOT NULL DEFAULT ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mural_comments (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id           UUID NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
      parent_comment_id  UUID REFERENCES mural_comments(id) ON DELETE CASCADE,
      usuario_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      autor_nome        TEXT NOT NULL,
      texto             TEXT NOT NULL,
      criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mural_post_likes (
      post_id     UUID NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
      usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, usuario_id)
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mural_comment_likes (
      comment_id  UUID NOT NULL REFERENCES mural_comments(id) ON DELETE CASCADE,
      usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, usuario_id)
    )`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mural_posts_criado_em ON mural_posts (criado_em DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mural_posts_bairro ON mural_posts (LOWER(bairro))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mural_comments_post_id ON mural_comments (post_id, criado_em ASC)`);
}

export function registrarRotas(app: Express, pool: Pool): void {
  // OPORTUNIDADES
  app.get('/api/oportunidades', async (_req: Request, res: Response) => {
    if (!pool) return res.status(503).json({ erro: 'banco indisponivel' });
    try {
      const tipo = String(_req.query.tipo || '').trim();
      const bairro = String(_req.query.bairro || '').trim();
      const horario = String(_req.query.horario || '').trim();

      let sql = 'SELECT * FROM oportunidade WHERE 1=1';
      const params: (string | number)[] = [];
      let idx = 1;

      if (tipo) { sql += ` AND tipo = $${idx++}`; params.push(tipo); }
      if (bairro) { sql += ` AND LOWER(bairro) LIKE LOWER($${idx++})`; params.push(`%${bairro}%`); }
      if (horario) { sql += ` AND LOWER(horario) LIKE LOWER($${idx++})`; params.push(`%${horario}%`); }

      sql += ' ORDER BY id DESC';
      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (e) {
      console.error('oportunidades', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  let cacheOportunidades = { dados: null as any, ultimaAtualizacao: 0 };
  const TEMPO_CACHE = 60 * 60 * 1000;

  function filtrarOportunidadesExternas(
    dados: any[],
    filtros: { tipo?: string; bairro?: string; horario?: string },
  ): any[] {
    let filtradas = Array.isArray(dados) ? [...dados] : [];

    if (filtros.tipo) {
      filtradas = filtradas.filter((o) => o.tipo === filtros.tipo);
    }

    if (filtros.bairro) {
      const b = filtros.bairro.toLowerCase();
      filtradas = filtradas.filter(
        (o) => String(o.bairro || '').toLowerCase().includes(b) || String(o.endereco || '').toLowerCase().includes(b),
      );
    }

    if (filtros.horario) {
      const h = filtros.horario.toLowerCase();
      filtradas = filtradas.filter((o) => String(o.horario || '').toLowerCase().includes(h));
    }

    return filtradas;
  }

  app.get('/api/oportunidades/externas', async (req: Request, res: Response) => {
    try {
      const tipo = String(req.query.tipo || '').trim();
      const bairro = String(req.query.bairro || '').trim();
      const horario = String(req.query.horario || '').trim();
      const filtros = {
        tipo: tipo || undefined,
        bairro: bairro || undefined,
        horario: horario || undefined,
      };

      let dadosBase = cacheOportunidades.dados;
      const cacheValido = dadosBase && (Date.now() - cacheOportunidades.ultimaAtualizacao < TEMPO_CACHE);

      if (!cacheValido) {
        dadosBase = await unificarOportunidadesExternas();
        cacheOportunidades.dados = dadosBase;
        cacheOportunidades.ultimaAtualizacao = Date.now();
      }

      res.json(filtrarOportunidadesExternas(dadosBase || [], filtros));
    } catch (e) {
      console.error('oportunidades externas', e);
      res.status(500).json({ erro: 'erro ao buscar oportunidades externas' });
    }
  });

  app.get('/api/oportunidades/:id', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ erro: 'id inválido' });
    }
    try {
      const { rows } = await pool.query('SELECT * FROM oportunidade WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ erro: 'oportunidade não encontrada' });
      res.json(rows[0]);
    } catch (e) {
      console.error('oportunidade', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  // CANDIDATURAS
  app.get('/api/candidaturas', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.*, o.titulo as oportunidade_titulo, o.tipo as oportunidade_tipo
         FROM candidatura c JOIN oportunidade o ON c.oportunidade_id = o.id
         WHERE c.usuario_id = $1 ORDER BY c.data_candidatura DESC`,
        [req.usuarioId],
      );
      res.json(rows);
    } catch (e) {
      console.error('candidaturas', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.post('/api/candidaturas', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const oportunidade_id = Number(req.body?.oportunidade_id);
      const mensagem = String(req.body?.mensagem || '').trim();

      if (!oportunidade_id || Number.isNaN(oportunidade_id)) {
        return res.status(400).json({ erro: 'informe a oportunidade' });
      }

      const existente = await pool.query(
        'SELECT 1 FROM candidatura WHERE usuario_id=$1 AND oportunidade_id=$2',
        [req.usuarioId, oportunidade_id],
      );
      if (existente.rowCount && existente.rowCount > 0) {
        return res.status(409).json({ erro: 'você já se candidatou a esta oportunidade' });
      }

      const op = await pool.query('SELECT 1 FROM oportunidade WHERE id=$1', [oportunidade_id]);
      if (!op.rowCount || op.rowCount === 0) {
        return res.status(404).json({ erro: 'oportunidade não encontrada' });
      }

      const { rows } = await pool.query(
        `INSERT INTO candidatura (usuario_id, oportunidade_id, mensagem)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.usuarioId, oportunidade_id, mensagem],
      );
      res.status(201).json(rows[0]);
    } catch (e: any) {
      if (e?.code === '23505') {
        return res.status(409).json({ erro: 'você já se candidatou a esta oportunidade' });
      }
      console.error('candidatar', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  // MURAL NOVO
  async function obterAutor(usuarioId: string | undefined): Promise<{ nome: string; bairro: string }> {
    if (!usuarioId) return { nome: 'Anônima', bairro: '' };
    const u = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [usuarioId]);
    const p = await pool.query('SELECT bairro FROM perfil WHERE usuario_id=$1', [usuarioId]);
    return {
      nome: String(u.rows[0]?.nome || 'Anônima'),
      bairro: String(p.rows[0]?.bairro || ''),
    };
  }

  async function alternarCurtidaPost(postId: string, usuarioId: string) {
    const existe = await pool.query(
      'SELECT 1 FROM mural_post_likes WHERE post_id=$1 AND usuario_id=$2',
      [postId, usuarioId],
    );
    if (existe.rowCount) {
      await pool.query('DELETE FROM mural_post_likes WHERE post_id=$1 AND usuario_id=$2', [postId, usuarioId]);
      return false;
    }
    await pool.query('INSERT INTO mural_post_likes (post_id, usuario_id) VALUES ($1, $2)', [postId, usuarioId]);
    return true;
  }

  async function alternarCurtidaComentario(commentId: string, usuarioId: string) {
    const existe = await pool.query(
      'SELECT 1 FROM mural_comment_likes WHERE comment_id=$1 AND usuario_id=$2',
      [commentId, usuarioId],
    );
    if (existe.rowCount) {
      await pool.query('DELETE FROM mural_comment_likes WHERE comment_id=$1 AND usuario_id=$2', [commentId, usuarioId]);
      return false;
    }
    await pool.query('INSERT INTO mural_comment_likes (comment_id, usuario_id) VALUES ($1, $2)', [commentId, usuarioId]);
    return true;
  }

  app.get('/api/mural', async (req: Request, res: Response) => {
    try {
      const bairro = String(req.query.bairro || '').trim();
      const tipo = String(req.query.tipo || '').trim();
      const auth = String(req.headers.authorization || '');
      const usuarioLogado = validarToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');

      let sql = `
        SELECT
          p.*,
          COALESCE(lp.likes_count, 0)::int AS likes_count,
          COALESCE(cq.comments_count, 0)::int AS comments_count,
          COALESCE(me.me_liked, false) AS me_liked
        FROM mural_posts p
        LEFT JOIN (
          SELECT post_id, COUNT(*)::int AS likes_count
          FROM mural_post_likes
          GROUP BY post_id
        ) lp ON lp.post_id = p.id
        LEFT JOIN (
          SELECT post_id, COUNT(*)::int AS comments_count
          FROM mural_comments
          GROUP BY post_id
        ) cq ON cq.post_id = p.id
        LEFT JOIN (
          SELECT post_id, true AS me_liked
          FROM mural_post_likes
          WHERE usuario_id = $1
        ) me ON me.post_id = p.id
        WHERE 1=1
      `;
      const params: any[] = [usuarioLogado || null];
      let idx = 2;

      if (bairro) {
        sql += ` AND LOWER(p.bairro) = LOWER($${idx++})`;
        params.push(bairro);
      }
      if (isMuralTipo(tipo)) {
        sql += ` AND p.tipo = $${idx++}`;
        params.push(tipo);
      }

      sql += ' ORDER BY p.criado_em DESC LIMIT 100';
      const { rows } = await pool.query(sql, params);
      res.json(normalizarCurtidas(rows));
    } catch (e) {
      console.error('mural', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.post('/api/mural', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const texto = String(req.body?.texto || '').trim();
      const bairroCorpo = String(req.body?.bairro || '').trim();
      const tipo = String(req.body?.tipo || 'postagem').trim();
      const categoria = String(req.body?.categoria || '').trim();
      const media_url = String(req.body?.media_url || '').trim();
      const media_tipo = String(req.body?.media_tipo || '').trim();
      const media_nome = String(req.body?.media_nome || '').trim();

      if (!texto) return res.status(400).json({ erro: 'escreva uma mensagem' });
      if (!isMuralTipo(tipo)) return res.status(400).json({ erro: 'tipo de publicação inválido' });

      const autor = await obterAutor(req.usuarioId);
      const bairro = bairroCorpo || autor.bairro || 'Recife';

      const { rows } = await pool.query(
        `INSERT INTO mural_posts (usuario_id, autor_nome, bairro, tipo, categoria, media_url, media_tipo, media_nome, texto)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.usuarioId, autor.nome, bairro, tipo, categoria, media_url, media_tipo, media_nome, texto],
      );

      res.status(201).json({ ...rows[0], likes_count: 0, comments_count: 0, me_liked: false });
    } catch (e) {
      console.error('mural post', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.get('/api/mural/:id/comentarios', async (req: Request, res: Response) => {
    try {
      const postId = String(req.params.id || '').trim();
      const auth = String(req.headers.authorization || '');
      const usuarioLogado = validarToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
      if (!postId) return res.status(400).json({ erro: 'id inválido' });

      const post = await pool.query('SELECT 1 FROM mural_posts WHERE id=$1', [postId]);
      if (!post.rowCount) return res.status(404).json({ erro: 'postagem não encontrada' });

      const { rows } = await pool.query(
        `
          SELECT
            c.*,
            COALESCE(lq.likes_count, 0)::int AS likes_count,
            COALESCE(me.me_liked, false) AS me_liked
          FROM mural_comments c
          LEFT JOIN (
            SELECT comment_id, COUNT(*)::int AS likes_count
            FROM mural_comment_likes
            GROUP BY comment_id
          ) lq ON lq.comment_id = c.id
          LEFT JOIN (
            SELECT comment_id, true AS me_liked
            FROM mural_comment_likes
            WHERE usuario_id = $2
          ) me ON me.comment_id = c.id
          WHERE c.post_id = $1
          ORDER BY c.criado_em ASC
        `,
        [postId, usuarioLogado || null],
      );

      res.json(normalizarCurtidas(rows));
    } catch (e) {
      console.error('mural comentarios', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.post('/api/mural/:id/comentarios', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const postId = String(req.params.id || '').trim();
      const texto = String(req.body?.texto || '').trim();
      const parentCommentId = String(req.body?.parent_comment_id || '').trim();
      if (!postId) return res.status(400).json({ erro: 'id inválido' });
      if (!texto) return res.status(400).json({ erro: 'escreva um comentário' });

      const post = await pool.query('SELECT 1 FROM mural_posts WHERE id=$1', [postId]);
      if (!post.rowCount) return res.status(404).json({ erro: 'postagem não encontrada' });

      if (parentCommentId) {
        const parent = await pool.query('SELECT 1 FROM mural_comments WHERE id=$1 AND post_id=$2', [parentCommentId, postId]);
        if (!parent.rowCount) return res.status(404).json({ erro: 'comentário pai não encontrado' });
      }

      const autor = await obterAutor(req.usuarioId);
      const { rows } = await pool.query(
        `INSERT INTO mural_comments (post_id, parent_comment_id, usuario_id, autor_nome, texto)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [postId, parentCommentId || null, req.usuarioId, autor.nome, texto],
      );

      res.status(201).json({ ...rows[0], likes_count: 0, me_liked: false });
    } catch (e) {
      console.error('mural comentario post', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.post('/api/mural/:id/curtir', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const postId = String(req.params.id || '').trim();
      if (!postId) return res.status(400).json({ erro: 'id inválido' });
      const curtido = await alternarCurtidaPost(postId, String(req.usuarioId));
      const total = await pool.query('SELECT COUNT(*)::int AS total FROM mural_post_likes WHERE post_id=$1', [postId]);
      res.json({ ok: true, curtido, likes_count: Number(total.rows[0]?.total || 0) });
    } catch (e) {
      console.error('mural curtir post', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.post('/api/mural/comentarios/:id/curtir', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const commentId = String(req.params.id || '').trim();
      if (!commentId) return res.status(400).json({ erro: 'id inválido' });
      const curtido = await alternarCurtidaComentario(commentId, String(req.usuarioId));
      const total = await pool.query('SELECT COUNT(*)::int AS total FROM mural_comment_likes WHERE comment_id=$1', [commentId]);
      res.json({ ok: true, curtido, likes_count: Number(total.rows[0]?.total || 0) });
    } catch (e) {
      console.error('mural curtir comentario', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  // PERFIL
  app.get('/api/perfil', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const { rows } = await pool.query('SELECT * FROM perfil WHERE usuario_id=$1', [req.usuarioId]);
      const u = await pool.query('SELECT nome, email_cifrado FROM usuarios WHERE id=$1', [req.usuarioId]);
      const nome = u.rows[0]?.nome || '';
      const email = u.rows[0]?.email_cifrado ? decifrarEmail(u.rows[0].email_cifrado) : '';

      if (!rows[0]) {
        return res.json({
          usuario_id: req.usuarioId,
          nome,
          email,
          telefone: '',
          cpf: '',
          data_nascimento: '',
          bairro: '',
          filhos: 0,
          idades_filhos: '',
          turno_disponivel: '',
          interesses: '',
          photo_url: '',
          sobre_mim: '',
          experiencias: '[]',
          cursos: '[]',
          habilidades: '[]',
        });
      }

      res.json({ ...rows[0], nome, email });
    } catch (e) {
      console.error('perfil', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.put('/api/perfil', autenticar, async (req: ReqAuth, res: Response) => {
    try {
      const { nome, email, telefone, cpf, data_nascimento, bairro, filhos, idades_filhos, turno_disponivel, interesses, photo_url, sobre_mim, experiencias, cursos, habilidades } = req.body || {};

      if (nome && typeof nome === 'string' && nome.trim()) {
        await pool.query('UPDATE usuarios SET nome=$1 WHERE id=$2', [nome.trim(), req.usuarioId]);
      }

      await pool.query(
        `INSERT INTO perfil (usuario_id, telefone, cpf, data_nascimento, bairro, filhos, idades_filhos, turno_disponivel, interesses, photo_url, sobre_mim, experiencias, cursos, habilidades)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (usuario_id) DO UPDATE SET
           telefone=EXCLUDED.telefone,
           cpf=EXCLUDED.cpf,
           data_nascimento=EXCLUDED.data_nascimento,
           bairro=EXCLUDED.bairro,
           filhos=EXCLUDED.filhos,
           idades_filhos=EXCLUDED.idades_filhos,
           turno_disponivel=EXCLUDED.turno_disponivel,
           interesses=EXCLUDED.interesses,
           photo_url=EXCLUDED.photo_url,
           sobre_mim=EXCLUDED.sobre_mim,
           experiencias=EXCLUDED.experiencias,
           cursos=EXCLUDED.cursos,
           habilidades=EXCLUDED.habilidades`,
        [
          req.usuarioId,
          String(telefone || ''),
          String(cpf || ''),
          String(data_nascimento || ''),
          String(bairro || ''),
          Number(filhos || 0),
          String(idades_filhos || ''),
          String(turno_disponivel || ''),
          String(interesses || ''),
          String(photo_url || ''),
          String(sobre_mim || ''),
          String(experiencias || '[]'),
          String(cursos || '[]'),
          String(habilidades || '[]'),
        ],
      );

      res.json({ ok: true });
    } catch (e) {
      console.error('perfil put', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.get('/api/mapa/locais', async (req: Request, res: Response) => {
    if (!pool) return res.status(503).json({ erro: 'banco de dados nao disponivel' });
    try {
      const categoriasQuery = String(req.query.categorias || '').trim();
      let sql = "SELECT * FROM equipamentos_locais WHERE categoria != 'Outros' AND latitude IS NOT NULL AND longitude IS NOT NULL";
      const params: any[] = [];

      if (categoriasQuery) {
        const categoriasArray = categoriasQuery.split(',').map(c => c.trim()).filter(Boolean);
        if (categoriasArray.length > 0) {
          sql += ' AND categoria = ANY($1::varchar[])';
          params.push(categoriasArray);
        }
      }

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (e) {
      console.error('Erro ao buscar equipamentos_locais:', e);
      res.status(500).json({ erro: 'erro interno' });
    }
  });

  app.post('/api/admin/sync-ckan', async (req: Request, res: Response) => {
    const configurado = process.env.ADMIN_SYNC_TOKEN || '';
    const apresentado = String(req.headers['x-admin-token'] || '');
    if (Buffer.byteLength(configurado, 'utf8') < 32) {
      return res.status(503).json({ erro: 'sincronizacao administrativa nao configurada' });
    }
    const a = Buffer.from(apresentado, 'utf8');
    const b = Buffer.from(configurado, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ erro: 'nao autenticado' });
    }
    if (!pool) return res.status(503).json({ erro: 'banco de dados nao disponivel' });
    try {
      const { sincronizarEquipamentosCKAN } = await import('./services/ckanSync.js');
      // Executa de forma assíncrona (não bloqueia a resposta, mas aqui vamos aguardar para ter o resultado)
      await sincronizarEquipamentosCKAN(pool);
      res.json({ ok: true, mensagem: 'Sincronização CKAN concluída com sucesso.' });
    } catch (e) {
      console.error('Erro ao sincronizar CKAN:', e);
      res.status(500).json({ erro: 'erro interno durante sincronização' });
    }
  });
}
