# Verificação local

Em 13/10/2026, os checks de `scripts/verify.ps1` passaram no Windows com Node24.15 e
PostgreSQL17.10 no cluster privado, sem migrar o banco principal para testar:

- 40 testes backend em dez arquivos, com PostgreSQL real e processos independentes.
- 12 testes frontend em quatro arquivos, incluindo preservação de rascunho,
  versões, geração antiga e respostas fora de ordem.
- Typecheck TypeScript, formatação e build React/Node.
- Quatro cenários Playwright completos, juntos em7,6s, usando apenas `janela_test`.
- `git diff --check` sem erros após remover uma linha vazia final da documentação.

## Fluxos de navegador

1. Iniciar, provocar conflito nos exemplos, manter o formulário, reservar outro
   recurso, remarcar inclusive trocando o recurso, cancelar no celular e
   recarregar o histórico persistente.
2. Dois visitantes independentes: reserva alheia404. Reset em uma aba faz uma
   tentativa com rascunho antigo na outra receber404, preservando o texto.
3. Teclado: entrada, seleção de intervalo, finalidade, confirmação, abertura
   do detalhe e cancelamento. O diálogo de reset contém Tab entre suas ações,
   fecha com Escape e devolve foco ao controle original.
4. Uma aba remarca enquanto outra tenta cancelar a versão anterior. O conflito
   mostra o estado atual, mantém o motivo e permite carregá-lo explicitamente
   antes de confirmar o cancelamento com a nova versão.

O primeiro cenário também volta à agenda após cancelar, ativa a consulta das
canceladas e reabre seu histórico. Snapshots identificam recurso, data e zona.
A suíte backend observa uma remarcação bloqueada no PostgreSQL ultrapassar o
início original: a operação recebe409 e mantém reserva e eventos inalterados.

Não há API de negócio mockada nesses fluxos. Os mocks dos testes de componentes
verificam recuperação de estados, separadamente da prova HTTP/PostgreSQL.

## Concorrência

As provas de exclusão usam dois processos e uma conexão observadora que registra
o bloqueio real antes de liberar a primeira transação por IPC. O controle sem
constraint aceita a sobreposição. Outras disputas exercitam remarcação contra
criação, remarcação e cancelamento, além de reset/expiração e rollback após evento.
Um deadlock real na disputa de criação/remarcação reproduziu500; a correção
repete integralmente a transação abortada de forma limitada e a regressão
resulta em um vencedor e um conflito409.

## Interface

Capturas desktop1440 e mobile390 cobrem entrada, agenda, histórico cancelado e
reservas de15/30/45/60minutos. Cinco estados tiveram axe0, largura do documento
igual à viewport e nenhum pageerror. A revisão independente solicitou três
correções e depois marcou todas como resolvidas; o parecer cobre essas correções.
Tokens e componentes atuais estão em DESIGN.md; screenshots reais em docs/screenshots.

## Publicação verificada

A CI Linux [38500030936](https://github.com/Diogopbr/janela/actions/runs/38500030936)
passou no commit7c96e0a14506259d7344433dc8a4c8344d1ea6ff.
Os quatro cenários completos passaram em 22,3s na demonstração pública, com API e
Neon reais. Readiness/auth retornaram JSON 200; página e fontes retornaram 200.
Cookie Secure/HttpOnly/Lax, CSRF 419 e cinco caminhos privados 404 passaram.
Depois de redeploy, a mesma sessão abriu a mesma reserva/geração e cancelou o
intervalo; axe0 e nenhum pageerror nesse percurso. Capturas publicadas foram
atualizadas com o runtime hospedado.

## Limites da evidência

Não houve publicação social. O build de desenvolvimento local informa um chunk
próximo de664KB minificado; o build remoto de produção gerou444KB/135KB gzip.
Não foi realizado benchmark de carregamento ou teste de volume. Essa diferença
de build não representa uma otimização medida nem dispensa avaliação futura.
