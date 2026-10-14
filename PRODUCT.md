# Janela

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Projeto de portfólio de Diogo Pereira, destinado à avaliação por recrutadores
e desenvolvedores. O cenário de uso é uma pequena instalação que compartilha
salas e equipamentos. Operadores e reservas da demonstração são fictícios.

## Product Purpose

Reservar, remarcar e cancelar um recurso, consultando disponibilidade e histórico.
O produto deve impedir sobreposição mesmo quando confirmações são simultâneas,
e ajudar a resolver conflitos sem descartar o formulário.

## Operating Context

Frontend React e API Node/TypeScript no mesmo domínio, com PostgreSQL persistente.
Quatro recursos inteiros: Sala Alameda, Sala Brisa, Projetor 01 e Kit Áudio 01.
Horários de negócio são apresentados em America/Sao_Paulo e persistidos em UTC.

## Capabilities and Constraints

Criação idempotente, exclusão PostgreSQL, versões otimistas, histórico append-only,
cancelamento terminal e ambientes demo privados. Dias úteis, 9h..18h, passos de
15 minutos, duração de 15..240 minutos, antecedência de cinco minutos a 30 dias.
Sem feriados, pagamentos, notificações, recorrência ou calendário externo.

Demo tem validade fixa de 24 horas, quatro exemplos criados pelo serviço real,
limite total de 20 reservas e reset limitado sem renovar identidade do visitante.
Modo normal exige instalação explícita de credenciais próprias.

## Evidence on Hand

40 testes de backend passaram, incluindo duas instâncias HTTP e processos PostgreSQL
independentes com espera observada e controle negativo da exclusão. O navegador local
percorreu iniciar demo, criar, remarcar, cancelar e recarregar o histórico. Capturas
desktop1440/mobile390 tiveram axe0, sem overflow horizontal ou erro JavaScript.
Tipagem e build passaram. A revisão visual marcou as três correções solicitadas
como resolvidas. Os 12 testes frontend e os quatro fluxos E2E locais passaram.
A CI Linux passou, e os quatro fluxos também passaram na Vercel com Neon real,
incluindo versões concorrentes e consulta de canceladas. Sessão e reserva foram
mantidas após redeploy; cookies, CSRF e arquivos privados foram verificados.
Contratos e limitações estão em docs/contracts. Não há clientes ou receita a alegar.

## Product Principles

- O banco decide disponibilidade; a consulta da agenda não promete reservar.
- Um conflito preserva o rascunho e oferece recuperação explícita.
- Histórico registra mudanças sem reescrever acontecimentos anteriores.
- Dados fictícios e limites da demonstração permanecem claros.

## Accessibility & Inclusion

Português brasileiro, operação por teclado, rótulos explícitos, foco visível,
estados textuais e layout de registros legíveis no celular. Arrastar não pode
ser a única forma de agendar. Verificação em navegador e axe precede publicação.
