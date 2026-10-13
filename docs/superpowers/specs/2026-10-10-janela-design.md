# Janela — especificação do terceiro portfólio

Data: 10/10/2026. Conceito da coleção aprovado pelo Diogo. Detalhamento escolhido
por Codex sob a delegação explícita de decisões técnicas; não representa uma
nova revisão individual do usuário. Documento de preparação, sem implementação
ou publicação declarada. A execução começa depois de concluir o Lastro.

## Intenção e público

Construir uma aplicação React/Node/TypeScript que permita reservar espaços e
equipamentos sem aceitar horários sobrepostos, inclusive quando duas pessoas
confirmam ao mesmo tempo. O avaliador deve experimentar a agenda, provocar um
conflito, remarcar/cancelar e verificar o histórico. Evidência principal: proteção
real no PostgreSQL e recuperação compreensível no frontend.

Uma instalação atende um pequeno espaço compartilhado. Recursos representam
unidades inteiras: Sala Alameda, Sala Brisa, Projetor01 e Kit Áudio01. Nomes e
reservas da demonstração são fictícios. Não afirmar clientes, receita ou operação
comercial. Quantidade compartilhada, cobrança e sincronização externa não entram.

## Abordagem escolhida

Monólito modular Node/TypeScript, React e PostgreSQL; frontend e API no mesmo
domínio. Persistência resolve disponibilidade e autorização. Uma reserva ocupa
um recurso com intervalo UTC; a interface apresenta a zona da instalação.

Um calendário somente visual não provaria concorrência; checar disponibilidade
antes de inserir também não protege dois requests simultâneos. Usar constraint
de exclusão PostgreSQL para impedir intervalos sobrepostos por workspace/recurso.
Uma consulta de disponibilidade informa a tela, mas não reserva um horário.
Não introduzir microserviços, filas ou integração de calendário nesta versão.

## Fluxo completo

Visitante inicia ambiente privado, encontra recursos e reservas fictícias e
escolhe um dia. Seleciona recurso, início/fim e finalidade; a API confirma ou
devolve conflito, preservando o formulário e atualizando a disponibilidade.
Depois pode remarcar para outro horário/recurso e cancelar com motivo.
Detalhe mostra horários anteriores, ator, ação e instante de cada evento.

Agenda tem visão por dia/recurso e lista acessível. Uma reserva confirmada
ocupa o intervalo até ser cancelada. Cancelada é terminal; um novo agendamento
exige outra reserva. Não apagar reservas nem reescrever eventos. Reservas
passadas permanecem legíveis, mas não podem ser alteradas/canceladas.

## Regras do horário

- Cada recurso possui uma zona IANA explícita; primeira instalação usa
  America/Sao_Paulo. Não interpretar data local segundo a zona do servidor ou
  do navegador. Persistir instantes UTC e preservar a zona de negócio.
- Requests enviam ISO8601 com offset; a API verifica sua consistência com a
  zona do recurso. Data/hora local inexistente ou ambígua precisa de erro
  explícito, sem deslocar silenciosamente o agendamento.
- Intervalo fechado no início e aberto no fim, `[início,fim)`: 10h–11h e
  11h–12h podem coexistir; 10h–11h e 10h30–11h30 não podem.
- Início/fim em passos de15minutos; duração15..240minutos; dentro de um mesmo
  dia de segunda a sexta, entre9h e18h na zona do recurso. Sem feriados nesta
  versão, com essa limitação apresentada no produto.
- Novo início pelo menos5minutos após relógio do PostgreSQL e até30dias
  adiante. Remarcar aplica as mesmas regras. Nunca confiar em relógio enviado
  pelo cliente. Cancelamento somente antes do início atual.
- Finalidade3..120caracteres; motivo de remarcação/cancelamento3..500.
  Textos não aceitam controles ou quebras de linha, recebem escape normal na
  interface e não participam da definição de nomes de arquivos/queries SQL.

## Consistência e segurança

Constraint de exclusão combina workspace, resource e tstzrange com operador de
sobreposição, apenas para reservas confirmadas. FKs compostas impedem que uma
reserva/evento aponte para recurso/ator de outro ambiente. A extensão btree_gist
deve ser verificada na hospedagem e instalada pela migration com permissões
adequadas; falha de suporte bloqueia publicação, não vira checagem insegura na API.

Criar/remarcar/cancelar e seus eventos são transacionais. Mutações exigem versão
atual. Remarcação conflitante mantém horário anterior e não registra evento.
Violação de exclusão vira409 estruturado, sem stack trace ou dados alheios.
Requests de criação incluem uma chave de idempotência: retry idêntico devolve
mesma reserva/evento; reutilização da chave com conteúdo diferente gera409.
Remarcar/cancelar com versão antiga gera409 e preserva o estado vencedor.

HTTP somente autenticado para dados de ambiente. Cookies HttpOnly/Secure em
produção, CSRF em mutações, sessão no PostgreSQL, errors422/409/429/404 seguros.
Identificadores recebidos nunca autorizam acesso. Objetos alheios, ambientes
vencidos e gerações revogadas retornam404. Login normal exige credenciais
instaladas explicitamente; demo não usa senha compartilhada.

## Demonstração

Cada visitante recebe workspace privado com quatro recursos e exemplos
relativos ao próximo dia útil. Usar serviços de reserva reais para criar os
exemplos. Validade fixa24h, até20reservas incluindo exemplos; cancelamento não
repõe o limite total. Reset troca geração, revoga sessões antigas e não renova
identidade/rate limit. 1reset/min/visitante e10/h/IP; 10start/min/IP,
30mutações/min/visitante. Dados de demo nunca são dados de clientes.

Coleta oportunista limitada com SKIP LOCKED e comando administrativo para
drenagem; ambiente só aceita operações enquanto válido, antes/depois de locks
e antes de commit. Disputa reset/remarcação deve deixar uma única geração
válida, sem transportar automaticamente um formulário antigo para a nova.

## Interface própria

Agenda de recursos como instrumento de planejamento: fundo claro, tinta
escura e acento oliva, com faixas de horário e reservas legíveis. Não repetir
a oficina lateral do Bancada nem a mesa azul/cobre do Lastro. Direção final,
fontes locais e tokens serão fixados no plano e verificados no navegador.

Desktop: seleção do recurso, agenda do dia e detalhe/formulário com ações
próximas do intervalo escolhido. Mobile: lista por horário com recurso/início/
fim explícitos; sem arrastar como única forma de interagir. Calendário oferece
teclado e alternativa de lista. Cor acompanha texto de status; canceladas são
visíveis quando solicitadas, sem ocupar disponibilidade.

Conflito explica que o horário foi ocupado e oferece recarregar alternativas,
mantendo finalidade e seleção. Formulário deve mostrar zona/dia/duração e resumo
antes de confirmar. Nada de números de clientes, gráficos ou cartões de métricas
sem ligação com a próxima ação. A entrada da demo ensina o conflito com um
exemplo identificado, e tem uma ação clara para testar.

## Verificação obrigatória

1. Unidade: adjacência/sobreposição, limite de duração, horário comercial,
   calendário inválido, zona/offset, hora inexistente/ambígua e relógio real.
2. PostgreSQL: migration em banco vazio, exclusão e FKs; dois processos com
   mesmo recurso/intervalo: um confirma e um409, uma reserva/evento vencedor.
   Provar bloqueio entre conexões, não usar Promise.all/sleeps como evidência.
3. Controle negativo sem constraint demonstra o defeito de check-then-insert;
   a prova deve detectar sobreposição aceita quando a proteção é removida.
4. Remarcação versus criação, duas remarcações e remarcação versus cancelar:
   estado vencedor preservado, versão/eventos consistentes; rollback mantém
   reserva original em erro. Idempotência após perda de resposta.
5. Acesso: isolamento, expiração/reset concorrente, cookies/CSRF reais,
   sessões compartilhadas entre duas instâncias, limites sobrevivendo reset
   e coleta com reservas/eventos sem destruir ambientes ativos/normais.
6. Navegador: iniciar, escolher horário, reservar, reproduzir conflito,
   remarcar, cancelar e recarregar histórico. Desktop/mobile390, teclado,
   foco e axe; screenshots reais e nenhuma API de produção mockada.
7. CI/build/análise estática; deploy Vercel e PostgreSQL persistente somente
   depois de revisão independente e fluxo hospedado verificado. README com
   decisões, execução reproduzível, screenshots e limitações reais.

## Limites e fontes

Sem pagamentos, notificações, recorrência, feriados, múltiplas empresas no modo
normal, integrações Google Calendar, lotação compartilhada ou arraste obrigatório.
Versões e recursos atuais da plataforma serão checados no plano antes de instalar.

Base técnica: [ranges e exclusion constraints PostgreSQL17](https://www.postgresql.org/docs/17/rangetypes.html).
O documento define intenção; não declara features/testes/deploy realizados.
