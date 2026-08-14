// Upload de imagem EMBUTIDO — sem dependência (multer/busboy NÃO estão instalados
// e o node_modules é compartilhado, não dá pra instalar nada). A imagem chega como
// data URL (base64) em JSON, é validada, decodificada e salva em backend/uploads/
// (a ÚNICA pasta gravável em runtime — a plataforma cria com o dono certo). Os
// arquivos são servidos em GET /api/uploads/<arquivo>.
//
// Use no FRONT o helper frontend/src/upload.ts (enviarImagem), que redimensiona a
// imagem antes de mandar. Guarde no banco a URL retornada (/api/uploads/...).
import type { Express, Request, Response } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validarToken } from './auth';

// backend/uploads (a partir de backend/dist em runtime). Mesma pasta que a
// plataforma garante existir com o dono do serviço (não-root).
const DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB por imagem (já decodificada)

// Só imagens raster. SVG fica de fora de propósito (pode conter script → XSS).
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function inicializarUploads(app: Express): void {
  try {
    mkdirSync(DIR, { recursive: true });
  } catch {
    /* a plataforma já cria/dona; se falhar aqui, a escrita abaixo reporta */
  }

  // Servir os arquivos salvos (GET). Nome aleatório → cache longo e imutável.
  app.use('/api/uploads', express.static(DIR, { maxAge: '7d', index: false }));

  // Receber UMA imagem como data URL base64. Parser próprio (limite maior) ANTES
  // do express.json global (1mb) — por isso inicializarUploads roda primeiro.
  app.post('/api/uploads', express.json({ limit: '8mb' }), (req: Request, res: Response) => {
    const authorization = req.headers.authorization || '';
    if (!validarToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '')) {
      res.status(401).json({ erro: 'nao autenticado' });
      return;
    }
    const dados = req.body && typeof req.body.dados === 'string' ? (req.body.dados as string) : '';
    const m = /^data:([\w/+.-]+);base64,(.+)$/i.exec(dados);
    if (!m) {
      res.status(400).json({ erro: 'imagem inválida' });
      return;
    }
    const ext = EXT[m[1].toLowerCase()];
    if (!ext) {
      res.status(400).json({ erro: 'formato não suportado (use PNG, JPG, WEBP ou GIF)' });
      return;
    }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0) {
      res.status(400).json({ erro: 'imagem vazia' });
      return;
    }
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ erro: 'imagem muito grande (máx 6MB)' });
      return;
    }
    const nome = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
    try {
      writeFileSync(path.join(DIR, nome), buf);
    } catch (e) {
      console.error('upload: falha ao gravar', e);
      res.status(500).json({ erro: 'não foi possível salvar a imagem' });
      return;
    }
    res.json({ url: `/api/uploads/${nome}` });
  });
}
