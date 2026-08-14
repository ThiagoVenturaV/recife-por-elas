// Login seguro embutido — mesma filosofia da plataforma Alfaia, porém self-contained
// (só node:crypto, sem libs extras):
//   - SENHA: scrypt + salt aleatório, comparação em tempo constante (timingSafeEqual).
//   - E-MAIL (PII): cifrado em repouso com AES-256-GCM + blind index HMAC para buscar
//     sem decifrar. Um dump do banco NÃO revela os e-mails.
//   - SESSÃO: token assinado por HMAC (stateless), com expiração.
// As 3 chaves derivam do APP_SECRET (injetado por app pelo provisionamento). NUNCA
// devolvemos senha/hash/salt/e-mail-cifrado em resposta de API.
import crypto from 'node:crypto';
import type { Pool } from 'pg';

if (!process.env.APP_SECRET || Buffer.byteLength(process.env.APP_SECRET, 'utf8') < 32) {
  throw new Error('FATAL: APP_SECRET deve conter pelo menos 32 bytes.');
}
const SEGREDO = process.env.APP_SECRET;
const chaveAES = crypto.createHash('sha256').update(SEGREDO + '::aes').digest();
const chaveHMAC = crypto.createHash('sha256').update(SEGREDO + '::hmac').digest();
const chaveTok = crypto.createHash('sha256').update(SEGREDO + '::token').digest();

// --- Senha (scrypt + salt) ---
export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(senha, salt, 64);
  return salt.toString('hex') + ':' + dk.toString('hex');
}
export function verificarSenha(senha: string, guardado: string): boolean {
  const [saltHex, hashHex] = (guardado || '').split(':');
  if (!saltHex || !hashHex) return false;
  const dk = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), 64);
  const alvo = Buffer.from(hashHex, 'hex');
  return alvo.length === dk.length && crypto.timingSafeEqual(alvo, dk);
}

// --- E-mail (AES-256-GCM: nonce(12) || ct || tag(16)) + blind index (HMAC) ---
export function cifrarEmail(email: string): Buffer {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chaveAES, nonce);
  const ct = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, ct, cipher.getAuthTag()]);
}
export function decifrarEmail(buf: Buffer): string {
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', chaveAES, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
export function indiceEmail(email: string): string {
  return crypto.createHmac('sha256', chaveHMAC).update(normalizarEmail(email)).digest('hex');
}

// --- Token de sessão (HMAC-assinado, com expiração) ---
export function gerarToken(usuarioId: string, ttlSeg = 7 * 24 * 3600): string {
  const payload = Buffer.from(JSON.stringify({ sub: usuarioId, exp: Math.floor(Date.now() / 1000) + ttlSeg })).toString('base64url');
  const sig = crypto.createHmac('sha256', chaveTok).update(payload).digest('base64url');
  return payload + '.' + sig;
}
export function validarToken(token: string): string | null {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;
  const esperado = crypto.createHmac('sha256', chaveTok).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return String(p.sub);
  } catch {
    return null;
  }
}

// --- Token de redefinição de senha (sha256 guardado no banco) ---
export function gerarTokenReset(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}
export function hashTokenReset(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// --- Validações simples ---
export function normalizarEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

// Cria as tabelas de auth no schema da app (idempotente). Chamar no boot.
export async function inicializarAuth(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      email_cifrado BYTEA NOT NULL,
      email_indice  TEXT NOT NULL UNIQUE,
      senha_hash    TEXT NOT NULL,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reset_senha (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expira_em   TIMESTAMPTZ NOT NULL,
      usado       BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}
