// MÍDIA embutida — gravar ÁUDIO/VÍDEO no navegador (MediaRecorder, nativo) e
// enviar QUALQUER arquivo pro backend (/api/arquivos, corpo cru — nunca multer).
// Zero dependência. REUSE — não recrie captura nem upload.
//
// GRAVAR (áudio ou vídeo):
//   const grav = new Gravador();
//   await grav.iniciar('audio');                     // pede permissão ao usuário
//   …usuário fala… (mostre um timer/indicador de gravando)
//   const blob = await grav.parar();                 // Blob pronto pra preview
//   const limpar = prepararPreview(audioEl, blob);   // preview que TOCA (nunca use só createObjectURL — ver abaixo)
//   const { url } = await enviarArquivo(blob);       // sobe → /api/arquivos/x.weba
//   // toque depois com <audio controls src={url}> (o backend suporta seek/Range)
// Pra vídeo: iniciar('video', videoEl) — videoEl (muted) mostra o preview ao vivo.
//
// UX OBRIGATÓRIA ao gravar: explicar POR QUE precisa do microfone/câmera antes de
// pedir; estados gravando (timer) / preview / enviando / erro; permissão negada
// mostra aviso claro (não quebra a tela).
export type TipoGravacao = 'audio' | 'video';
import { BASE, getToken } from './api';

function melhorMime(tipo: TipoGravacao): string {
  const candidatos =
    tipo === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const c of candidatos) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export class Gravador {
  private stream: MediaStream | null = null;
  private gravador: MediaRecorder | null = null;
  private pedacos: Blob[] = [];
  private mime = '';

  static suportado(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  get gravando(): boolean {
    return this.gravador?.state === 'recording';
  }

  // Pede permissão e começa a gravar. Pra vídeo, passe um <video muted> pra
  // mostrar o preview ao vivo. Lança erro se a permissão for negada — trate e
  // mostre um aviso amigável ("precisamos do microfone pra gravar seu áudio").
  async iniciar(tipo: TipoGravacao, previewEl?: HTMLVideoElement): Promise<void> {
    if (!Gravador.suportado()) throw new Error('gravação não suportada neste navegador');
    this.stream = await navigator.mediaDevices.getUserMedia(
      tipo === 'audio' ? { audio: true } : { audio: true, video: { width: { ideal: 1280 } } },
    );
    if (previewEl && tipo === 'video') {
      previewEl.srcObject = this.stream;
      previewEl.muted = true;
      void previewEl.play().catch(() => undefined);
    }
    this.mime = melhorMime(tipo);
    this.pedacos = [];
    this.gravador = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.gravador.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.pedacos.push(e.data);
    };
    this.gravador.start(250);
  }

  // Para e devolve o Blob final (faça o preview antes de enviar).
  parar(): Promise<Blob> {
    return new Promise((resolver, rejeitar) => {
      const g = this.gravador;
      if (!g || g.state === 'inactive') {
        this.soltar();
        rejeitar(new Error('nada sendo gravado'));
        return;
      }
      g.onstop = () => {
        const blob = new Blob(this.pedacos, { type: this.mime || this.pedacos[0]?.type || 'application/octet-stream' });
        this.soltar();
        resolver(blob);
      };
      g.stop();
    });
  }

  // Aborta e descarta (botão cancelar).
  cancelar(): void {
    try {
      if (this.gravador && this.gravador.state !== 'inactive') this.gravador.stop();
    } catch {
      /* já parado */
    }
    this.pedacos = [];
    this.soltar();
  }

  private soltar(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.gravador = null;
  }
}

// PREVIEW confiável de um Blob recém-gravado. NÃO use só
// URL.createObjectURL(blob): o webm do MediaRecorder sai SEM a duração no
// cabeçalho → o player mostra duração infinita e, em vários navegadores, trava
// sem tocar (só funciona depois do upload, porque o backend serve com Range).
// Este helper liga o blob no <audio>/<video>, aplica o contorno (um seek
// gigante força o navegador a materializar a duração) e devolve a função de
// limpeza — chame-a ao fechar/descartar o preview (revoga o object URL).
//
//   const limpar = prepararPreview(audioEl, blob);
//   … usuário ouve, decide …
//   limpar();
export function prepararPreview(
  el: HTMLAudioElement | HTMLVideoElement,
  blob: Blob,
): () => void {
  const url = URL.createObjectURL(blob);
  // um <video> vindo do preview AO VIVO ainda aponta pro stream — solte antes,
  // senão o navegador ignora o src.
  if ('srcObject' in el && el.srcObject) el.srcObject = null;
  el.muted = false;
  el.controls = true;
  el.src = url;
  const aoCarregar = () => {
    if (el.duration === Infinity || Number.isNaN(el.duration)) {
      const volta = () => {
        el.removeEventListener('timeupdate', volta);
        el.currentTime = 0;
      };
      el.addEventListener('timeupdate', volta);
      el.currentTime = 1e7; // força o cálculo da duração (contorno do webm)
    }
  };
  el.addEventListener('loadedmetadata', aoCarregar, { once: true });
  el.load();
  return () => {
    el.removeEventListener('loadedmetadata', aoCarregar);
    URL.revokeObjectURL(url);
  };
}

export interface ArquivoEnviado {
  url: string;
  tipo: string;
  tamanho: number;
}

// Envia um Blob/File CRU pro backend. onProgresso recebe 0..100 (mostre uma
// barra em uploads grandes). O backend valida tipo (allowlist) e tamanho.
export function enviarArquivo(
  arquivo: Blob | File,
  onProgresso?: (pct: number) => void,
): Promise<ArquivoEnviado> {
  return new Promise((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/arquivos`);
    const tipo = arquivo.type || 'application/octet-stream';
    xhr.setRequestHeader('Content-Type', tipo);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken() || ''}`);
    if (xhr.upload && onProgresso) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && r.url) resolver(r as ArquivoEnviado);
        else rejeitar(new Error(r.erro || 'falha no envio do arquivo'));
      } catch {
        rejeitar(new Error('resposta inválida do servidor'));
      }
    };
    xhr.onerror = () => rejeitar(new Error('falha de rede no envio'));
    xhr.send(arquivo);
  });
}
