import { useEffect, useState } from 'react';
import { checarSaude, apiJSON } from './services/api';
import Auth from './components/Auth';
import { Link, navegar, useCaminho, rolarParaAncora } from './utils/roteador';
import { SessaoProvider, useSessao, Protegido } from './context/sessao';
import Feed from './paginas/Feed';
import OportunidadeDetalhe from './paginas/OportunidadeDetalhe';
import Mapa from './paginas/Mapa';
import Mural from './paginas/Mural';
import PlanoCarreira from './paginas/PlanoCarreira';
import Perfil from './paginas/Perfil';
import Cadastro from './paginas/Cadastro';

export default function App() {
  return (
    <SessaoProvider>
      <Conteudo />
    </SessaoProvider>
  );
}

function Conteudo() {
  const { estado, definirUsuario, encerrar } = useSessao();
  const caminho = useCaminho();
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'));

  useEffect(() => {
    if (!resetToken) return;
    if (caminho !== '/entrar') navegar('/entrar');
    else window.history.replaceState({}, '', '/entrar');
  }, [resetToken, caminho]);

  // ── /entrar ──
  if (caminho === '/entrar') {
    if (estado === 'logado') { navegar('/'); return null; }
    return (
      <Auth
        resetToken={resetToken}
        onLogado={(u: any) => { definirUsuario(u); if (resetToken) window.history.replaceState({}, '', '/'); navegar('/'); }}
        onVoltar={() => navegar('/')}
      />
    );
  }

  // ── /cadastro ──
  if (caminho === '/cadastro') {
    return <Cadastro />;
  }

  // ── /oportunidades/:id ──
  if (caminho.startsWith('/oportunidades/')) {
    return (
      <Protegido>
        <div className="pagina-topo">
          <HeaderApp />
          <OportunidadeDetalhe />
          <FooterLanding />
        </div>
      </Protegido>
    );
  }

  // ── /mapa ──
  if (caminho === '/mapa') {
    return (
      <Protegido>
        <div className="pagina-topo">
          <HeaderApp />
          <Mapa />
          <FooterLanding />
        </div>
      </Protegido>
    );
  }

  // ── /plano-carreira ──
  if (caminho === '/plano-carreira') {
    return (
      <Protegido>
        <div className="pagina-topo">
          <HeaderApp />
          <PlanoCarreira />
          <FooterLanding />
        </div>
      </Protegido>
    );
  }

  // ── /mural ──
  if (caminho === '/mural') {
    return (
      <Protegido>
        <div className="pagina-topo">
          <HeaderApp />
          <Mural />
          <FooterLanding />
        </div>
      </Protegido>
    );
  }

  // ── /perfil ──
  if (caminho === '/perfil') {
    return (
      <Protegido>
        <div className="pagina-topo">
          <HeaderApp />
          <Perfil />
          <FooterLanding />
        </div>
      </Protegido>
    );
  }

  // ── /privacidade ──
  if (caminho === '/privacidade') {
    return (
      <div className="pagina-topo">
        <HeaderLanding estado={estado} encerrar={encerrar} />
        <div className="container secao">
          <h1 className="secao-titulo" style={{marginBottom:24}}>Política de Privacidade</h1>
          <div style={{maxWidth:720,fontSize:15,color:'var(--texto-suave)',lineHeight:1.8}}>
            <p><strong>Recife Por Elas</strong> coleta apenas os dados necessários para conectar você a oportunidades de trabalho, capacitação e benefícios sociais.</p>
            <p style={{marginTop:16}}><strong>Dados coletados:</strong> nome, e-mail, cidade, bairro e preferências de oportunidades. Esses dados são usados exclusivamente para personalizar recomendações e nunca são compartilhados com terceiros sem seu consentimento.</p>
            <p style={{marginTop:16}}><strong>Seus direitos:</strong> você pode solicitar a exclusão dos seus dados a qualquer momento pelo e-mail contato@recifeporelas.org. Responderemos em até 15 dias.</p>
            <p style={{marginTop:16}}><strong>Armazenamento:</strong> seus dados ficam em servidores seguros no Brasil, seguindo a LGPD (Lei Geral de Proteção de Dados).</p>
            <p style={{marginTop:16}}>Última atualização: julho de 2026.</p>
          </div>
        </div>
        <FooterLanding />
      </div>
    );
  }

  // ── / (FEED quando logado, LANDING quando não) ──
  if (estado === 'logado') {
    return (
      <div className="pagina-topo">
        <HeaderApp />
        <Feed />
        <FooterLanding />
        <SaudeApi />
      </div>
    );
  }

  return (
    <div className="pagina-topo">
      <HeaderLanding estado={estado} encerrar={encerrar} />

      {/* HERO */}
      <section className="secao hp-hero" id="inicio">
        <div className="container hp-grade">
          <div className="hp-texto entrada-hero">
            <h1 className="hp-titulo">
              Oportunidades reais para <em>mulheres</em> que fazem o Recife acontecer
            </h1>
            <p className="hp-sub">
              Conectamos mulheres solo e mães solo a vagas de trabalho, cursos gratuitos, benefícios sociais e uma rede de apoio que entende sua realidade — tudo organizado por bairro e compatível com sua rotina.
            </p>
            <div className="hp-ctas">
              <Link to="/cadastro" className="btn-primario">Quero me cadastrar</Link>
              
            </div>
          </div>
          <div className="hp-foto hover-zoom-foto entrada-hero">
            <img
              src="https://img.magnific.com/fotos-gratis/retrato-intimo-da-linda-mae-segurando-seu-filho_23-2150551743.jpg"
              alt="Mulheres em círculo de apoio mútuo, sorrindo e se abraçando"
              loading="eager"
            />
          </div>
        </div>
      </section>
      {/* IMPACTO E CONTEXTO */}
      <section className="nu-faixa" id="impacto">
        <div className="container">
          <div className="secao-cabeca surgir" style={{ marginBottom: '40px', textAlign: 'center' }}>
            <span className="secao-etiqueta">Dados que transformam</span>
            <h2 className="secao-titulo">A realidade que queremos transformar</h2>
            <p className="secao-sub">
              Entendemos os desafios únicos enfrentados diariamente pelas mães solo e criamos o Recife por Elas para ser a ponte para um novo começo.
            </p>
          </div>
          <div className="nu-grade-3col surgir">
            <div className="nu-item-card">
              <strong className="nu-item-numero">+11 Milhões</strong>
              <span className="nu-item-texto">de mães solo no Brasil cuidando de lares inteiros sozinhas.</span>
              <div className="nu-item-fonte">
                <span>Fonte:</span> IBGE / Censo Demográfico
              </div>
            </div>
            <div className="nu-item-card">
              <strong className="nu-item-numero">47%</strong>
              <span className="nu-item-texto">das famílias chefiadas por mulheres vivem em situação de vulnerabilidade ou extrema pobreza.</span>
              <div className="nu-item-fonte">
                <span>Fonte:</span> FGV Social
              </div>
            </div>
            <div className="nu-item-card">
              <strong className="nu-item-numero">63%</strong>
              <span className="nu-item-texto">dos lares chefiados por mães solo dependem diretamente de auxílios e benefícios sociais.</span>
              <div className="nu-item-fonte">
                <span>Fonte:</span> CadÚnico / MDS
              </div>
            </div>
            <div className="nu-item-card">
              <strong className="nu-item-numero">74%</strong>
              <span className="nu-item-texto">das mães empreendedoras abriram o próprio negócio por absoluta necessidade de sustento.</span>
              <div className="nu-item-fonte">
                <span>Fonte:</span> Sebrae / GEM
              </div>
            </div>
            <div className="nu-item-card">
              <strong className="nu-item-numero">Elevada</strong>
              <span className="nu-item-texto">taxa de desemprego entre mulheres com filhos pequenos, superando a média nacional.</span>
              <div className="nu-item-fonte">
                <span>Fonte:</span> DIEESE / PNAD Contínua
              </div>
            </div>
            <div className="nu-item-card">
              <strong className="nu-item-numero">+80%</strong>
              <span className="nu-item-texto">relatam falta crônica de rede de apoio para conseguir trabalhar ou estudar em paz.</span>
              <div className="nu-item-fonte">
                <span>Fonte:</span> Instituto Mãe / Pesquisa Nacional
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* POR QUE USAR O NOSSO SITE - FAIXA DE APELO / CONVERSÃO */}
      <section className="apelo-faixa-destaque" id="por-que-usar">
        <div className="container apelo-conteudo-centralizado surgir">
          <h2 className="apelo-titulo-faixa">
            Sua maternidade é sua maior força. Não caminhe mais sozinha.
          </h2>

          <div className="apelo-texto-corrido-faixa">
            <p className="apelo-destaque-inicial-faixa">
              Ser mãe solo no Recife é um ato diário de coragem, resiliência e amor incondicional. Mas nós sabemos o quanto a rotina pode ser exaustiva e como, muitas vezes, parece que o mundo não foi desenhado para acolher o seu tempo e as suas necessidades.
            </p>

            <p>
              O <strong>Recife por Elas</strong> não é apenas mais um site — é um movimento criado sob medida para devolver o seu protagonismo. Nós acreditamos com convicção que cuidar da sua família não deve significar abrir mão dos seus sonhos ou da sua independência financeira. Cada funcionalidade da nossa plataforma foi pensada para abrir portas reais no seu próprio bairro, respeitando os horários dos seus filhos e a sua jornada.
            </p>

            <blockquote className="apelo-citacao-faixa">
              "Você já sustentou lares inteiros no amor e na raça. Agora, permita que uma rede inteira de oportunidades e mulheres segure a sua mão."
            </blockquote>

            <p>
              Conectamos você a <strong>oportunidades de trabalho acolhedoras</strong>, <strong>cursos de capacitação gratuitos</strong>, <strong>orientação descomplicada para benefícios sociais</strong> e uma comunidade vibrante de mulheres que entendem exatamente o que você vive. Dê hoje o passo que vai transformar não apenas o seu futuro, mas a história da sua família.
            </p>
          </div>

          <div className="apelo-acoes-faixa">
            <Link to="/cadastro" className="btn-secundario apelo-btn-faixa">
              Quero me cadastrar agora
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section className="secao" id="recursos">
        <div className="container">
          <div className="secao-cabeca surgir">
            <span className="secao-etiqueta">O que oferecemos</span>
            <h2 className="secao-titulo">Tudo que você precisa, num só lugar</h2>
            <p className="secao-sub">Da busca por emprego ao acolhimento emocional — cada recurso pensado para sua jornada.</p>
          </div>
          <div className="rc-grade">
            <article className="rc-card surgir">
              <span className="rc-icone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </span>
              <h3>Vagas de trabalho</h3>
              <p>Oportunidades com filtro por bairro, turno e compatibilidade com cuidados familiares. Vagas formais, temporárias e freelancer.</p>
            </article>
            <article className="rc-card surgir surgir-2">
              <span className="rc-icone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </span>
              <h3>Cursos e capacitação</h3>
              <p>Formação profissional gratuita ou a preço acessível: informática, vendas, beleza, gastronomia, cuidadora e muito mais.</p>
            </article>
            <article className="rc-card surgir surgir-3">
              <span className="rc-icone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
              <h3>Benefícios sociais</h3>
              <p>Informação clara sobre auxílios, bolsas e programas sociais que você tem direito, com ajuda para se inscrever.</p>
            </article>
            <article className="rc-card surgir">
              <span className="rc-icone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </span>
              <h3>Apoio emocional</h3>
              <p>Rede de acolhimento com outras mulheres que entendem sua jornada. Grupos de apoio e escuta ativa por profissionais voluntárias.</p>
            </article>
            <article className="rc-card surgir surgir-2">
              <span className="rc-icone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/></svg>
              </span>
              <h3>Busca por proximidade</h3>
              <p>Mapa interativo com oportunidades perto de você. Filtre por distância, avalie o transporte e escolha o que cabe no seu dia.</p>
            </article>
            <article className="rc-card surgir surgir-3">
              <span className="rc-icone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg>
              </span>
              <h3>Assistente inteligente</h3>
              <p>Recomendações diárias personalizadas: uma vaga, um curso, um benefício. E a explicação de por que cada item combina com você.</p>
            </article>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="ct-faixa" id="comecar">
        <div className="container ct-caixa">
          <h2 className="ct-titulo surgir">Ajude a construir essa comunidade</h2>
          <p className="ct-sub surgir">Estamos em fase inicial de testes. Cadastre-se para ser uma das nossas primeiras usuárias e ajude a moldar uma plataforma que respeita sua rotina e seu bairro.</p>
          <Link to="/cadastro" className="btn-secundario surgir">Fazer parte agora</Link>
        </div>
      </section>

      {/* FAQ (POSICIONADO ESTRATEGICAMENTE POR ÚLTIMO, IMEDIATAMENTE ANTES DO RODAPÉ) */}
      <section className="secao" id="faq">
        <div className="container fq-caixa">
          <div className="secao-cabeca surgir">
            <span className="secao-etiqueta">Dúvidas</span>
            <h2 className="secao-titulo">Perguntas frequentes</h2>
          </div>
          <div className="fq-lista surgir">
            <details className="fq-item">
              <summary>O serviço é gratuito?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
              <p>Sim, totalmente gratuito para as mulheres. O Recife Por Elas é mantido por parcerias com a prefeitura, ONGs e institutos. Nenhuma taxa é cobrada em nenhuma etapa — do cadastro à candidatura.</p>
            </details>
            <details className="fq-item">
              <summary>Preciso ter experiência profissional?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
              <p>Não. Temos vagas para todos os níveis, inclusive primeiro emprego. Se você não tem experiência, o app prioriza mostrar cursos de capacitação e vagas de entrada que combinam com seu perfil.</p>
            </details>
            <details className="fq-item">
              <summary>Como vocês protegem meus dados?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
              <p>Seus dados são protegidos pela LGPD. Só usamos suas informações para personalizar recomendações de vagas e cursos. Nunca compartilhamos com terceiros sem seu consentimento explícito.</p>
            </details>
            <details className="fq-item">
              <summary>Consigo usar pelo celular?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
              <p>Sim, o Recife Por Elas foi feito para celular. Você pode acessar de qualquer smartphone com internet — não precisa instalar nada, é só abrir o navegador. Funciona até em conexões mais lentas.</p>
            </details>
            <details className="fq-item">
              <summary>E se eu não encontrar vagas no meu bairro?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
              <p>O app mostra vagas próximas, organizadas por distância. Você também pode buscar em bairros vizinhos. E se não houver nada no momento, a plataforma sugere cursos e capacitações enquanto novas vagas surgem.</p>
            </details>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <FooterLanding />

      <SaudeApi />
    </div>
  );
}

// ─── Componentes compartilhados ───

// ─── Header do app logado (menu principal) ───
function HeaderApp() {
  const { usuario, encerrar } = useSessao();
  const caminho = useCaminho();
  const [fotoPerfil, setFotoPerfil] = useState('');
  const ativo = (p: string) => caminho === p || (p !== '/' && caminho.startsWith(p));
  const iniciais = (usuario?.nome || 'A').split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    let ativo = true;
    apiJSON<{ photo_url?: string }>('/perfil')
      .then((perfil: any) => {
        if (ativo) setFotoPerfil(perfil.photo_url || '');
      })
      .catch(() => {
        if (ativo) setFotoPerfil('');
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <header className="hn-topo-app">
      <div className="container hn-linha-app">
        <Link to="/" className="hn-logo-app">
          <img src="/logos/quadrado.png" alt="Recife Por Elas" className="brand-logo-img" />
        </Link>
        <nav className="hn-menu-app">
          <Link to="/" className={ativo('/') && !ativo('/oportunidades') ? 'ativo' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>Feed</span>
          </Link>
          <Link to="/mapa" className={ativo('/mapa') ? 'ativo' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/></svg>
            <span>Mapa</span>
          </Link>
          <Link to="/plano-carreira" className={ativo('/plano-carreira') ? 'ativo' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/></svg>
            <span>Plano de carreira</span>
          </Link>
          <Link to="/mural" className={ativo('/mural') ? 'ativo' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>Rede</span>
          </Link>
        </nav>
        <div className="hn-acoes-app">
          <Link to="/perfil" className="hn-usuario-app hn-usuario-destaque" style={{textDecoration:'none'}}>
            <span className="hn-avatar-app">
              {fotoPerfil ? <img src={fotoPerfil} alt={`Foto de perfil de ${usuario?.nome || 'usuária'}`} /> : iniciais}
            </span>
            <span>Meu perfil</span>
          </Link>
          <button className="btn-secundario" style={{fontSize:13,padding:'0 12px',minHeight:34}} onClick={encerrar}>Sair</button>
        </div>
      </div>
    </header>
  );
}

function HeaderLanding({ estado, encerrar }: { estado: string; encerrar: () => void }) {
  return (
    <header className="hn-topo">
      <div className="container hn-linha">
        <a href="#inicio" onClick={(e) => rolarParaAncora(e, 'inicio')} className="hn-logo">
          <img src="/logos/quadrado.png" alt="Recife Por Elas" className="brand-logo-img" />
        </a>
        <nav className="hn-nav">
          <a href="#inicio" onClick={(e) => rolarParaAncora(e, 'inicio')}>Início</a>
          <a href="#por-que-usar" onClick={(e) => rolarParaAncora(e, 'por-que-usar')}>Por que usar?</a>
          <a href="#recursos" onClick={(e) => rolarParaAncora(e, 'recursos')}>Recursos</a>
          <a href="#faq" onClick={(e) => rolarParaAncora(e, 'faq')}>Dúvidas</a>
        </nav>
        <div className="hn-acoes">
          {estado === 'logado' ? (
            <>
              <Link to="/perfil" className="btn-secundario" style={{fontSize:14,padding:'0 14px',minHeight:38}}>Meu perfil</Link>
              <button className="btn-primario" style={{fontSize:14,padding:'0 14px',minHeight:38}} onClick={encerrar}>Sair</button>
            </>
          ) : (
            <Link to="/cadastro" className="btn-primario">Cadastre-se grátis</Link>
          )}
          <input type="checkbox" id="hn-menu" className="hn-check" aria-hidden="true" />
          <label htmlFor="hn-menu" className="hn-burger" aria-label="Abrir menu">
            <span></span><span></span><span></span>
          </label>
        </div>
        <nav className="hn-nav-movel">
          <a href="#inicio" onClick={(e) => rolarParaAncora(e, 'inicio')}>Início</a>
          <a href="#por-que-usar" onClick={(e) => rolarParaAncora(e, 'por-que-usar')}>Por que usar?</a>
          <a href="#recursos" onClick={(e) => rolarParaAncora(e, 'recursos')}>Recursos</a>
          <a href="#faq" onClick={(e) => rolarParaAncora(e, 'faq')}>Dúvidas</a>
          {estado === 'logado' ? (
            <>
              <a href="/perfil">Meu perfil</a>
              <a href="/mural">Rede de apoio</a>
            </>
          ) : (
            <a href="/entrar">Entrar</a>
          )}
        </nav>
      </div>
    </header>
  );
}

function FooterLanding() {
  const parceiros = [
    { logo: '/logos/1.png' },
    { logo: '/logos/2.png' },
    { logo: '/logos/3.png' },
    { logo: '/logos/4.png' },
    { logo: '/logos/5.png' }
  ];

  return (
    <footer className="rp-rodape">
      <div className="container">
        <div className="rp-apoiadores-container">
          <div className="rp-apoiadores-cabeca">
            <span className="rp-apoiadores-tag">Rede de Apoio e Parcerias</span>
            <h4 className="rp-apoiadores-titulo">Apoiadores e Parceiros Institucionais</h4>
          </div>
          <div className="rp-apoiadores-grade">
            {parceiros.map((item, idx) => (
              <div key={idx} className="rp-apoiador-card">
                <img src={item.logo} alt={`Parceiro ${idx}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="rp-grade">
          <div className="rp-marca">
            <a href="#inicio" onClick={(e) => rolarParaAncora(e, 'inicio')} className="rp-logo">
              <img src="/logos/quadrado.png" alt="Recife Por Elas" className="brand-logo-img" />
            </a>
            <p>Conectando mulheres do Recife a oportunidades de trabalho, capacitação e apoio — respeitando sua rotina e seu território.</p>
          </div>
          <nav className="rp-col">
            <h4>Plataforma</h4>
            <a href="#inicio" onClick={(e) => rolarParaAncora(e, 'inicio')}>Início</a>
            <a href="#por-que-usar" onClick={(e) => rolarParaAncora(e, 'por-que-usar')}>Por que usar?</a>
            <a href="#recursos" onClick={(e) => rolarParaAncora(e, 'recursos')}>Recursos</a>
            <a href="#faq" onClick={(e) => rolarParaAncora(e, 'faq')}>Dúvidas</a>
            <a href="/mapa">Mapa</a>
          </nav>
          <nav className="rp-col">
            <h4>Para você</h4>
            <a href="/cadastro">Criar conta</a>
            <Link to="/plano-carreira">Plano de carreira</Link>
            <a href="/mural">Rede de apoio</a>
          </nav>
          <nav className="rp-col">
            <h4>Legal</h4>
            <a href="/privacidade">Política de privacidade</a>
          </nav>
        </div>
        <div className="rp-base">
          <span>&copy; 2026 Recife Por Elas. Todos os direitos reservados.</span>
          <span>contato@recifeporelas.org</span>
        </div>
      </div>
    </footer>
  );
}

function SaudeApi() {
  const [, setStatus] = useState<'verificando' | 'online' | 'offline'>('verificando');
  useEffect(() => { checarSaude().then((ok: boolean) => setStatus(ok ? 'online' : 'offline')); }, []);
  return null; // invisível na landing — só debug
}
