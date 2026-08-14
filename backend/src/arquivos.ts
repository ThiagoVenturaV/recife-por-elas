// ARQUIVOS & MÍDIA embutidos — áudio, vídeo, PDF, planilha etc. Zero dependência
// (multer/busboy NÃO existem no node_modules compartilhado). O arquivo chega CRU
// no corpo (application/octet-stream via frontend/src/midia.ts → enviarArquivo),
// é validado por MIME (allowlist) e tamanho POR TIPO, e salvo em backend/uploads/
// (a única pasta gravável). Servido em GET /api/arquivos/<nome> com suporte a
// RANGE (o <audio>/<video> consegue buscar/seek) e ?baixar=1 pra forçar download.
//
// Imagens de formulário continuam no fluxo próprio (uploads.ts + upload.ts) —
// este módulo cobre os DEMAIS formatos (áudio/vídeo gravados, PDF, CSV, etc.).
import type { Express, Request, Response } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validarToken } from './auth';

const DIR = path.join(__dirname, '..', 'uploads');

// MIME permitidos → extensão. SVG/HTML/JS ficam FORA de propósito (XSS).
const TIPOS: Record<string, string> = {
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Limite de tamanho por família de tipo (bytes). O Nginx das filhas aceita até
// 60m no /api/ — os tetos abaixo ficam dentro disso.
function limitePara(tipo: string): number {
  if (tipo.startsWith('video/')) return 50 * 1024 * 1024;
  if (tipo.startsWith('audio/')) return 25 * 1024 * 1024;
  if (tipo.startsWith('image/')) return 6 * 1024 * 1024;
  return 15 * 1024 * 1024; // pdf, planilhas, zip, docx…
}

const mimePorExt: Record<string, string> = Object.fromEntries(
  Object.entries(TIPOS).map(([mime, ext]) => [ext, mime]),
);

export function inicializarArquivos(app: Express): void {
  try {
    mkdirSync(DIR, { recursive: true });
  } catch {
    /* a plataforma garante a pasta; a escrita reporta se faltar */
  }

  // Receber UM arquivo CRU no corpo. Content-Type = o MIME real do arquivo;
  // X-Nome (opcional) = nome amigável pro download. Resposta: { url, tipo, tamanho }.
  app.post(
    '/api/arquivos',
    express.raw({ type: () => true, limit: '60mb' }),
    (req: Request, res: Response) => {
      const authorization = req.headers.authorization || '';
      if (!validarToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '')) {
        res.status(401).json({ erro: 'nao autenticado' });
        return;
      }
      const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = TIPOS[tipo];
      if (!ext) {
        res.status(400).json({ erro: 'tipo de arquivo não suportado: ' + (tipo || 'desconhecido') });
        return;
      }
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        res.status(400).json({ erro: 'arquivo vazio' });
        return;
      }
      const max = limitePara(tipo);
      if (buf.length > max) {
        res.status(413).json({ erro: `arquivo muito grande (máx ${Math.round(max / 1024 / 1024)}MB para ${tipo})` });
        return;
      }
      const nome = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
      try {
        writeFileSync(path.join(DIR, nome), buf);
      } catch (e) {
        console.error('arquivos: salvar', e);
        res.status(500).json({ erro: 'não foi possível salvar o arquivo' });
        return;
      }
      res.status(201).json({ url: `/api/arquivos/${nome}`, tipo, tamanho: buf.length });
    },
  );

  // Servir com suporte a RANGE (streaming: o player de áudio/vídeo faz seek).
  // ?baixar=1 força download; ?nome=Relatorio.pdf dá o nome amigável do download.
  app.get('/api/arquivos/:nome', (req: Request, res: Response) => {
    const nome = String(req.params.nome || '');
    if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(nome) || nome.includes('..')) {
      res.status(400).json({ erro: 'nome inválido' });
      return;
    }
    const caminho = path.join(DIR, nome);
    let tamanho = 0;
    try {
      const st = statSync(caminho);
      if (!st.isFile()) throw new Error('não é arquivo');
      tamanho = st.size;
    } catch {
      res.status(404).json({ erro: 'arquivo não encontrado' });
      return;
    }
    const ext = nome.split('.').pop() || '';
    const tipo = mimePorExt[ext.toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', tipo);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    if (req.query.baixar) {
      const amigavel = String(req.query.nome || nome).replace(/[^\w. àáâãéêíóôõúüç-]/gi, '_').slice(0, 100);
      res.setHeader('Content-Disposition', `attachment; filename="${amigavel}"`);
    }

    const range = String(req.headers.range || '');
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      let ini = m[1] ? parseInt(m[1], 10) : Math.max(0, tamanho - parseInt(m[2], 10));
      let fim = m[1] && m[2] ? parseInt(m[2], 10) : tamanho - 1;
      if (isNaN(ini) || isNaN(fim) || ini > fim || ini >= tamanho) {
        res.status(416).setHeader('Content-Range', `bytes */${tamanho}`).end();
        return;
      }
      fim = Math.min(fim, tamanho - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${ini}-${fim}/${tamanho}`);
      res.setHeader('Content-Length', String(fim - ini + 1));
      createReadStream(caminho, { start: ini, end: fim }).pipe(res);
      return;
    }
    res.setHeader('Content-Length', String(tamanho));
    createReadStream(caminho).pipe(res);
  });
}
