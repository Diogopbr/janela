# Janela

Reserva de espaços e equipamentos com React, Node.js/TypeScript e PostgreSQL.
Projeto de portfólio de Diogo Pereira.

O fluxo permite reservar, remarcar, cancelar e consultar histórico.
A regra central impede sobreposição no banco, incluindo confirmação
simultânea, e explicar o conflito sem descartar o formulário.

[Especificação](docs/superpowers/specs/2026-10-10-janela-design.md).

[Experimentar a demonstração](https://janela-diogopbr.vercel.app).
Cada visitante recebe seu ambiente privado com dados fictícios, válido por 24h.
Sem pagamentos, feriados, recorrência ou calendário externo.

## Fundação verificada

O backend possui configuração explícita de ambiente, pool PostgreSQL limitado,
migrations transacionais com checksum e endpoint `/health/ready`. A prontidão
retorna 503 antes das migrations e 200 após sua aplicação; não executa migrations
durante o startup. Produção exige HTTPS, TLS verificado no banco e segredo de sessão.

Em 13/10/2026 passaram 40 testes backend locais, incluindo HTTP real, PostgreSQL e
processos independentes para a prova de exclusão. Tipagem TypeScript, formatação
e build React/Node passaram. Acesso, criação, remarcação e cancelamento estão
implementados, com 12 testes frontend. O navegador local percorreu iniciar,
criar, remarcar, cancelar e recarregar o histórico. Capturas desktop1440/mobile390
tiveram axe0, sem overflow horizontal ou erro JavaScript.

Os quatro cenários Playwright passaram juntos no banco isolado de teste, incluindo
recuperação de conflito entre abas e consulta de reservas canceladas. Evidências
e limites em [verificação local](docs/evidence/verification.md). No Windows
preparado, `./scripts/verify.ps1` executa todos os checks e migrations somente
em `janela_test`.

Os quatro fluxos também passaram na Vercel, em 22,3s, com PostgreSQL Neon real.
A CI Linux passou com Node24.15/PostgreSQL17.10. Sessão e reserva persistiram
após redeploy; cookies seguros, CSRF e arquivos privados foram verificados.
Configuração e permissões em [hospedagem](docs/hosting.md).

Contratos: [acesso](docs/contracts/access.md) e [reservas](docs/contracts/reservations.md).

Interface: [sistema de design](DESIGN.md), fontes locais com licenças e agenda
proporcional no desktop; no celular, reservas aparecem como registros rotulados.

![Entrada com exemplo fictício de sobreposição](docs/screenshots/entrada.png)

![Agenda de recursos com editor ao lado](docs/screenshots/agenda.png)

Requisitos: Node 24.15 ou superior da série 24, npm 11.12.1 e PostgreSQL 17.
Instale com `npm ci`, configure as variáveis de `.env.example`, aplique
`npm run migrate` explicitamente e use `npm run dev`. Para os testes de integração,
use uma role e banco separados `janela_test` em `127.0.0.1`, informados em
`JANELA_TEST_DATABASE_URL`. Os scripts PowerShell locais preparam esse ambiente
sem versionar credenciais. `npm run typecheck` e `npm run build` verificam a compilação.
