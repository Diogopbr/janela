# Verificação local

Em 13/10/2026, `scripts/verify.ps1` concluiu no Windows com Node24.15 e
PostgreSQL17.10 no cluster privado, sem migrar o banco principal para testar:

- 39 testes backend em dez arquivos, com PostgreSQL real e processos independentes.
- 10 testes frontend em quatro arquivos, incluindo preservação de rascunho,
  versões, geração antiga e respostas fora de ordem.
- Typecheck TypeScript, formatação e build React/Node.
- Três cenários Playwright completos, juntos em6,0s, usando apenas `janela_test`.
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

## Limites da evidência

A CI Linux está configurada, mas ainda não foi executada remotamente. Não há
deploy, URL pública, prova de HTTPS/cookies hospedados ou publicação social do
Janela. Build local não declara comportamento da plataforma de hospedagem.
O build ainda informa um chunk agregado próximo de662KB minificado; a análise
de carregamento pode motivar divisão por rota antes da publicação.
