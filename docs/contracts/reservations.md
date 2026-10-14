# Reservas

`POST /api/reservations` recebe somente `resourceId`, `startsAt`, `endsAt`,
`purpose` e `idempotencyKey`. Identificadores usam UUID. Sessão, ator, ambiente,
versão inicial e relógio são definidos pelo servidor. A criação retorna 201 com
`reservation` e `replayed: false`; repetir o comando confirmado retorna 200,
o mesmo identificador e `replayed: true`, sem consumir outra posição da quota.
Reutilizar a chave com outro conteúdo normalizado retorna 409 `IDEMPOTENCY_CONFLICT`.

Horários têm data, segundos e offset explícito consistente com a zona IANA do
recurso. Persistência usa UTC. Horário local inexistente/ambíguo retorna 422
`INVALID_LOCAL_TIME`; offset inconsistente, `INVALID_OFFSET`. Passos de 15 minutos,
duração de 15..240 minutos, mesmo dia útil e intervalo 9h..18h. O início deve
estar pelo menos cinco minutos à frente do relógio PostgreSQL e até 30 dias adiante.
Finalidade contém 3..120 caracteres, sem controles, caracteres de formatação ou
quebras de linha. Entrada inválida não grava comando, reserva nem evento.

O intervalo é `[início,fim)`: intervalos adjacentes são aceitos. A constraint
`no_overlapping_reservations` combina ambiente, recurso e `tstzrange`, somente
para reservas confirmadas. A API não faz check-then-insert de disponibilidade.
Violação da exclusão é traduzida em 409 `RESERVATION_CONFLICT`, com `conflicts`
restritos ao próprio ambiente. O cliente preserva o formulário e recarrega a agenda.

`GET /api/availability?resourceId=<uuid>&date=YYYY-MM-DD` devolve recurso, data,
zona, relógio do servidor e reservas confirmadas que ocupam o dia. A consulta
aceita `includeCancelled=true` para consultar também as canceladas do mesmo
ambiente. Elas aparecem na lista com acesso ao histórico e não ocupam a grade.
A consulta não garante posse de um intervalo. `GET /api/reservations/:id` devolve a reserva
e histórico com ator, instante e snapshots. Recurso ou reserva alheios retornam 404.

O ambiente demo tem limite total de 20 reservas, incluindo os quatro exemplos.
Cancelar não repõe a quota. Um lock transacional específico protege essa contagem;
a instalação normal não possui esse limite. Mutações demo têm limite de 30/minuto
por visitante, preservado entre gerações. Idempotência é verificada antes de
reaplicar a regra de antecedência a um comando já confirmado: perder uma resposta
não impede recuperar a reserva quando o horário original já passou.

Reserva, comando e evento inicial são atômicos. FKs compostas impedem associação
com recurso/ator de outro ambiente. Eventos não podem ser editados ou apagados
isoladamente; a coleta pode remover uma geração demo inteira e seus dependentes.

## Evidência local

Dois processos PostgreSQL independentes mantêm inserts concorrentes no mesmo
intervalo. Uma terceira conexão observa `pg_blocking_pids` apontando para o primeiro
processo antes de liberá-lo por IPC. O primeiro confirma; o segundo recebe `23P01`.
Uma tabela de controle sem exclusão aceita ambos antes de qualquer commit e a
consulta de sobreposição detecta o par. Essa prova não depende do lock de quota.
As requisições simultâneas em duas instâncias HTTP verificam separadamente o
mapeamento para uma resposta 201 e uma 409; não substituem a observação no banco.

Essas evidências são locais. O navegador real também percorreu iniciar demo,
criar, remarcar, cancelar e recarregar o histórico, com API e PostgreSQL reais.
As quatro capturas desktop1440/mobile390 tiveram axe0, sem overflow horizontal
ou erro JavaScript. Isso não substitui a suíte E2E completa nem execução hospedada:
CI e publicação ainda precisam de verificação.

## Remarcar e cancelar

`PATCH /api/reservations/:id` recebe `resourceId`, `startsAt`, `endsAt`, `purpose`,
`reason` e `expectedVersion`. Exige mudança de recurso ou intervalo; editar somente
a finalidade não representa remarcação. `POST /api/reservations/:id/cancel` recebe
`reason` e `expectedVersion`. Motivos têm 3..500 caracteres, sem controles ou quebras.

As duas ações bloqueiam ambiente e depois reserva. Versão divergente retorna 409
`VERSION_CONFLICT` com `current`, para recuperação explícita do formulário.
Reservas canceladas são terminais (`RESERVATION_CLOSED`); passadas são somente
leitura (`RESERVATION_PAST`). Sucesso incrementa a versão e acrescenta um evento
com snapshots antes/depois. Cancelar libera o intervalo, mas não repõe a quota.

Conflito de remarcação devolve `RESERVATION_CONFLICT` e preserva horário, versão
e eventos anteriores. Falha injetada por trigger após inserir o evento foi usada
para comprovar rollback integral. Deadlock (`40P01`) ou falha de serialização
(`40001`) repetem a transação inteira após rollback, no máximo duas vezes adicionais;
não há efeitos externos nessas transações. A repetição revalida autorização,
validade, versão e disponibilidade. Erros persistentes não são mascarados como sucesso.

Processos independentes exercitam remarcação contra criação, outra remarcação e
cancelamento, com espera observada no PostgreSQL antes de liberar a barreira.
O observador aceita cadeias de bloqueio que chegam à conexão controladora:
um segundo processo pode aguardar o primeiro, que aguarda a barreira.
Cada disputa deixa um vencedor e histórico consistente.

Outras provas observam expiração durante espera, revogação antes de obter lock
e reset real aguardando uma mutação ativa. Expiração/revogação impedem commit da
geração antiga; quando a mutação vence primeiro, seu evento precede a revogação.
Uma nova tentativa com a geração encerrada recebe 404.
