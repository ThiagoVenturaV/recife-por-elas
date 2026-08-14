// Chama o backend configurado via VITE_API_URL (se relativa) ou força /api por padrão.
// BASE é exportado para os módulos satélite (acessos, upload, midia) garantindo
// caminhos relativos (/api) para roteamento via proxy no Vercel.
const envUrl = import.meta.env.VITE_API_URL;
export const BASE = (envUrl && envUrl.startsWith('/') && !envUrl.startsWith('//'))
  ? envUrl
  : '/api';
const CHAVE_TOKEN = 'app_token';

export function getToken(): string | null {
  const atual = sessionStorage.getItem(CHAVE_TOKEN);
  const legado = localStorage.getItem(CHAVE_TOKEN);
  if (!atual && legado) sessionStorage.setItem(CHAVE_TOKEN, legado);
  localStorage.removeItem(CHAVE_TOKEN);
  return atual || legado;
}
export function setToken(t: string) {
  sessionStorage.setItem(CHAVE_TOKEN, t);
  localStorage.removeItem(CHAVE_TOKEN);
}
export function sair() {
  sessionStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_TOKEN);
}

export async function checarSaude(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// apiFetch — fetch com o token de auth JÁ anexado (Authorization: Bearer).
// USE em TODA chamada de API protegida — não remonte o header na mão nem
// esqueça o token (dá 401 fantasma). 401 → limpa a sessão (token venceu/deslogou).
export async function apiFetch(caminho: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${caminho}`, { ...opts, headers });
  if (res.status === 401) sair();
  return res;
}

// apiJSON — apiFetch + JSON. É o jeito PADRÃO de fazer CRUD autenticado.
// GET:    await apiJSON<Item[]>('/itens')
// POST:   await apiJSON('/itens', { method: 'POST', corpo: { nome } })
// PUT/DELETE idem. Lança Error com a MENSAGEM do servidor quando !ok.
export async function apiJSON<T>(
  caminho: string,
  opts: { method?: string; corpo?: unknown } = {},
): Promise<T> {
  const init: RequestInit = { method: opts.method || 'GET' };
  if (opts.corpo !== undefined) {
    init.body = JSON.stringify(opts.corpo);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await apiFetch(caminho, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { erro?: string })?.erro || `erro ${res.status}`);
  return data as T;
}

// getJSON — atalho de leitura autenticado (delega pro apiJSON: já leva o token).
export async function getJSON<T>(caminho: string): Promise<T> {
  return apiJSON<T>(caminho);
}

// --- Auth (login seguro embutido) ---

async function postAuth<T>(caminho: string, corpo: unknown): Promise<T> {
  const res = await fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { erro?: string })?.erro || `erro ${res.status}`);
  return data as T;
}

export interface Usuario {
  id: string;
  nome: string;
  email?: string;
}

export async function cadastrar(nome: string, email: string, senha: string): Promise<Usuario> {
  const r = await postAuth<{ token: string; usuario: Usuario }>('/auth/cadastro', { nome, email, senha });
  setToken(r.token);
  return r.usuario;
}

export async function entrar(email: string, senha: string): Promise<Usuario> {
  const r = await postAuth<{ token: string; usuario: Usuario }>('/auth/entrar', { email, senha });
  setToken(r.token);
  return r.usuario;
}

export async function recuperar(email: string): Promise<string> {
  const r = await postAuth<{ mensagem: string }>('/auth/recuperar', { email });
  return r.mensagem;
}

export async function redefinir(token: string, senha: string): Promise<string> {
  const r = await postAuth<{ mensagem: string }>('/auth/redefinir', { token, senha });
  return r.mensagem;
}

export async function eu(): Promise<Usuario | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/auth/eu`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) sair();
    return null;
  }
  return (await res.json()) as Usuario;
}
