# Recife por Elas — instalação no seu servidor

Este pacote tem TUDO que a sua aplicação precisa para rodar em qualquer máquina com
Docker. Você não instala Node, banco nem configura servidor à mão — o Docker cuida
disso. A app vem com a ESTRUTURA do banco (as tabelas), mas SEM dados: você começa
com o banco limpo.

## 1. Pré-requisitos
Uma VPS/máquina Linux (Ubuntu serve bem) com Docker e Docker Compose. Se ainda não
tiver, instale rodando:

    curl -fsSL https://get.docker.com | sh

## 2. Suba os arquivos
Copie esta pasta (recife-por-elas) para o servidor e entre nela:

    cd recife-por-elas

## 3. Configure
Copie o exemplo e preencha:

    cp .env.example .env
    nano .env

No arquivo .env, preencha:
- DB_PASSWORD — uma senha forte para o banco.
- APP_SECRET — gere com "openssl rand -hex 32" e cole.
- ADMIN_SYNC_TOKEN — token aleatório de 32 bytes ou mais para a sincronização administrativa.
- ALLOWED_ORIGINS — origens HTTPS permitidas, separadas por vírgula.
- PORTA_PUBLICA — a porta onde a app responde (ex.: 8080).
- As chaves de serviços externos que a app usa (se houver).

## 4. Suba a aplicação

    docker compose up -d --build

A primeira vez demora um pouco (baixa e monta tudo). Acompanhe com:

    docker compose logs -f app

## 5. Acesse
No navegador: http://SEU_IP:8080 (ou a porta que você escolheu).

## 6. (Opcional) Domínio com HTTPS
O jeito mais fácil é pôr um proxy reverso na frente que tira o certificado sozinho,
como o Caddy. Aponte o domínio para o IP do servidor e faça o proxy para a porta da app.

---
### Comandos úteis
- Parar:                       docker compose down
- Parar e APAGAR o banco:      docker compose down -v
- Ver logs:                    docker compose logs -f
- Atualizar após mudar algo:   docker compose up -d --build
