# Hospedagem

O Janela usa o preset Vite para publicar os assets React gerados em `public/`
no CDN e uma função Express em `api/index.ts`, região São Paulo (`gru1`).
As quatro rotas de navegação recebem `index.html`; `/api/*` e `/health/ready`
chegam à função mantendo o caminho original para o router Express.
O build compila a interface e o backend, sem migrar ou semear o banco.
O servidor local recebe um router de assets próprio; a entrada publicada contém
somente a API. Isso evita que o rastreamento da função tente compilar fontes
React ou incluir arquivos de desenvolvimento. O build da Vercel foi reproduzido
localmente no preset Express e passou após essa separação. A configuração final
Vite/API passou no build remoto; o CLI local no Windows encontrou `cmd.exe ENOENT`
nesse preset, e essa execução não é registrada como aprovada. Helmet é resolvido
pela entrada CommonJS do pacote para manter o mesmo middleware nos compiladores;
o `require` explícito permite ao tracer incluir a dependência na função.

O upload exclui apenas os diretórios gerados na raiz. Os arquivos originais de
fontes em `frontend/public/` continuam incluídos e são copiados pelo Vite.
Gerar assets no build remoto evita misturar hashes de builds locais e remotos.

A integração automática de Express foi substituída porque a publicação real
não entregava os assets gerados. A API manteve seu export; o wrapper explícito
e o preset Vite permitem verificar frontend e backend na mesma origem.

## Banco e permissões

O PostgreSQL Neon usa o plano Free, em um projeto exclusivo para o Janela.
Migrations são aplicadas pela conexão administrativa direta com TLS verificado.
Na preparação real, `btree_gist` 1.8 foi instalado e as duas migrations passaram.

A função recebe somente a URL de `janela_app`, uma role sem superuser,
criação de bancos, criação de roles ou permissão de criar objetos no schema.
Ela pode executar o CRUD necessário nas tabelas de operação. Eventos permitem
somente leitura e inserção, e o registro de migrations permite somente leitura.
A verificação real negou UPDATE/DELETE de eventos e CREATE TABLE com 42501.
Criar uma demo gravou os quatro eventos esperados; remover sua geração inteira
pela role limitada apagou os eventos por cascade, conforme a política de coleta.

As variáveis administrativas inseridas pela integração foram removidas ao
desconectar o recurso do projeto Vercel; o banco continua ativo. Credenciais
e segredo de sessão ficam em variáveis sensíveis, fornecidas por stdin.

## Configuração

`APP_URL` identifica a origem HTTPS pública. `DB_TLS=true` exige verificação do
certificado, mesmo se a URL contiver parâmetros SSL. `SESSION_SECRET` permanece
estável entre deploys. `JANELA_DEMO_ENABLED=true` habilita os ambientes fictícios,
enquanto o login normal fica desabilitado na demonstração pública.

`JANELA_VERCEL_INGRESS=true`, junto ao marcador de runtime da plataforma, habilita
o tratamento explícito dos headers de proxy. A origem do cliente e o cookie
seguro precisam ser verificados no runtime publicado; configuração ou build
isolados não comprovam esse comportamento.

A aplicação não oferece migração administrativa por HTTP. Alterações de schema
e instalação de usuários normais são operações explícitas fora do startup.
Os testes de integração usam outro banco, nunca o banco público.

## Estado de publicação

A demonstração está em https://janela-diogopbr.vercel.app. A CI Linux e o build
remoto passaram. Os quatro cenários Playwright hospedados passaram juntos em 22,3s.
Cookie Secure/HttpOnly/SameSite=Lax, CSRF 419 e caminhos privados 404 foram verificados.
Uma sessão salva antes de um redeploy abriu a mesma reserva e geração depois dele;
o cancelamento com essa sessão também passou. O PostgreSQL permanece a fonte dos
dados e sessões, independentemente da instância da função.
