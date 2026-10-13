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
não garante posse de um intervalo. `GET /api/reservations/:id` devolve a reserva
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

Essas evidências são locais. CI, browser completo e execução hospedada ainda
precisam de verificação antes da publicação.
