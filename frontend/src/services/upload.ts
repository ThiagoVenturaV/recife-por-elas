// Envia UMA imagem pro backend (/api/uploads) e devolve a URL salva (/api/uploads/..).
// Redimensiona no cliente (até ~1600px, JPEG q0.85) pra não estourar tamanho.
// SEM dependência. Use em qualquer formulário que aceite imagem do usuário final:
//   const url = await enviarImagem(arquivo);  // guarde 'url' no banco
import { BASE, getToken } from './api';
const MAX_LADO = 1600;

export async function enviarImagem(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('o arquivo não é uma imagem');
  const dados = await paraDataUrl(file);
  const r = await fetch(`${BASE}/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken() || ''}`,
    },
    body: JSON.stringify({ dados }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { erro?: string }).erro || 'falha ao enviar a imagem');
  }
  const { url } = (await r.json()) as { url: string };
  return url;
}

// Lê o arquivo e, quando dá, redimensiona via canvas (vira JPEG). GIF mantém o
// original (preserva animação). Retorna uma data URL base64.
function paraDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('não foi possível ler o arquivo'));
    reader.onload = () => {
      const src = String(reader.result);
      if (file.type === 'image/gif') {
        resolve(src);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('imagem inválida'));
      img.onload = () => {
        const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
