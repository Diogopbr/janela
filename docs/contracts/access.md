# Acesso e ambientes

Todos os dados pertencem a um ambiente identificado pela sessão assinada,
armazenada no PostgreSQL. Identificadores de ambiente enviados no corpo não
autorizam acesso. `X-Janela-Workspace` representa a geração esperada pela página;
se não corresponder à sessão, a operação recebe 404. O cliente deve capturá-lo
antes de buscar um token CSRF, preservando a identidade de um formulário aberto.

`GET /api/csrf` cria ou devolve um token de segurança da sessão. Mutações exigem
`Origin` igual a `APP_URL` e `X-CSRF-Token`. Ausência ou divergência retorna 419.
Cookies de sessão e visitante usam HttpOnly e SameSite=Lax; Secure é obrigatório
em produção. Respostas de acesso não podem ser armazenadas em cache.

`GET /api/auth` informa o ambiente atual e a disponibilidade dos modos demo e
normal. Um visitante sem sessão recebe `workspace: null`. `GET /api/resources`
exige ambiente ativo; objetos vencidos, revogados ou de outra geração recebem 404.

`POST /api/demo/start` cria um ambiente privado com quatro recursos fictícios,
ou recupera o ambiente ainda ativo do mesmo visitante. A validade original de
24 horas não é estendida. O limite é dez tentativas aceitas por minuto/IP.
`POST /api/demo/reset` exige propriedade e validade, revoga o ambiente anterior,
invalida suas sessões e cria uma nova geração. A identidade do visitante permanece:
um reset/minuto/visitante e dez/hora/IP. Limites usam janelas fixas do relógio do
PostgreSQL; 429 inclui `Retry-After` em segundos.

O modo normal não tem usuário padrão. `npm run install-user` recebe JSON com
`email`, `name` e `password` por stdin, após migrations explícitas. Não passe
credenciais como argumentos de comando nem versione o arquivo de entrada.
Uma instalação normal tem quatro recursos e pode ter usuários instalados
explicitamente. Reinstalação de credenciais invalida sessões da instalação.
`POST /api/login` exige `JANELA_LOGIN_ENABLED=true`, verifica a senha e troca o
identificador da sessão. Credenciais incorretas recebem 401; modo desativado,
404. Dez tentativas/minuto/IP. `POST /api/logout` destrói a sessão.

Uma transação de negócio valida ator e validade antes do lock, depois de obter
`FOR SHARE` e antes do commit. Reset utiliza `FOR UPDATE`, que conflita com esse
lock. Falha implica rollback; mensagens públicas não contêm SQL ou credenciais.

A coleta oportunista é coordenada por registro no banco, com intervalo de um
minuto e lote de dez ambientes demo vencidos/revogados. `SKIP LOCKED` evita
esperar por ambientes em uso. `npm run cleanup -- 100` drena em lotes; aceita
1..1000. Ambientes bloqueados ficam para uma execução posterior. Sessões e
limites vencidos também são coletados em lotes. Identidades de visitante são
preservadas para manter o vínculo entre gerações.

O seed da demo cria quatro reservas e seus eventos pelo serviço real de criação,
na mesma transação do ambiente. Para o próximo dia útil: Alameda 9h–10h/10h–11h,
Brisa 14h–15h e Projetor 15h–16h. O Kit Áudio começa livre. Repetir start recupera
a geração atual sem recriar exemplos ou estender sua validade.
