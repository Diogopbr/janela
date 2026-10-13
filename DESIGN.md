---
name: Janela
description: Agenda de recursos com intervalos claros e histórico legível.
colors:
  paper: "#f6f4ed"
  surface: "#fffef8"
  ink: "#252c25"
  muted: "#59604f"
  line: "#d6dacb"
  olive: "#435c2f"
  olive-hover: "#324923"
  selected: "#e2ebd5"
  error: "#8b3228"
  error-bg: "#fff0e8"
  focus: "#1d623b"
  control-border: "#a7af9b"
  placeholder: "#67705f"
  header: "#edf0e5"
  booking: "#dfe9d3"
  booking-border: "#829572"
  booking-hover: "#d0dfbf"
  booking-state: "#435b32"
  slot-divider: "#e6e8df"
  hour-divider: "#bfc8b2"
  danger-surface: "#fff9f5"
  danger-hover: "#f9e1d6"
  danger-border: "#cfa69b"
  cancelled-surface: "#eee4dc"
  cancelled-text: "#70483c"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.6
  label:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 550
  wordmark:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 750
rounded:
  booking: "4px"
  control: "5px"
  dialog: "12px"
spacing:
  label-gap: "8px"
  compact-gap: "12px"
  field-gap: "16px"
  form-gap: "20px"
  intermediate-gap: "24px"
  section-gap: "28px"
  editor-inset: "32px"
  workspace-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.olive}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.olive-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.selected}"
  button-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  booking-block:
    backgroundColor: "{colors.booking}"
    textColor: "{colors.ink}"
    rounded: "{rounded.booking}"
    padding: "8px 12px"
  booking-block-hover:
    backgroundColor: "{colors.booking-hover}"
  status-confirmed:
    backgroundColor: "{colors.selected}"
    padding: "8px 12px"
  status-cancelled:
    backgroundColor: "{colors.cancelled-surface}"
    textColor: "{colors.cancelled-text}"
    padding: "8px 12px"
---

# Design System: Janela

## Overview

**Creative North Star: "Orientação clara"**

Janela usa papel quente, tinta escura e oliva para orientar a leitura de horários, recursos e ações. A tipografia tem presença nos títulos, enquanto os dados e campos mantêm uma linguagem direta. A interface deve permitir localizar um intervalo, conferir sua duração e entender seu estado sem depender apenas de cor.

O espaço separa agenda e edição; divisórias discretas organizam o conteúdo. A identidade vem da relação entre tempo, seleção e confirmação, com controles nativos e estados escritos em português brasileiro.

**Key Characteristics:**

- Papel quente e superfícies claras, com oliva nas ações e seleções.
- Manrope nos títulos e Public Sans nos dados e controles.
- Intervalos proporcionais à duração e alternativa em lista.
- Estados textuais, foco visível e recuperação de conflitos.

## Colors

A paleta aproxima fundos de papel e verdes suaves, reservando contraste forte para texto, ações e foco. Os valores normativos estão no frontmatter.

### Primary

- **Oliva:** ação principal, links e cursor de texto; a variante mais escura acompanha hover.
- **Verde de seleção:** intervalo escolhido, hover de ações secundárias e estado confirmado.
- **Verde de reserva:** bloco confirmado, com borda própria e variante de hover.
- **Verde de foco:** contorno de teclado independente da seleção.

### Secondary

- **Terra de erro:** texto e fundo de mensagens de falha, com superfícies e bordas próprias nas ações destrutivas.
- **Terra de cancelamento:** estado terminal escrito, preservado na página de detalhe.

### Neutral

- **Papel:** fundo da aplicação.
- **Superfície clara:** campos, trilha de horários e diálogo.
- **Tinta:** texto principal e marca.
- **Tinta secundária:** contexto, instruções e metadados.
- **Linhas suaves:** divisórias de conteúdo; campos e blocos têm bordas mais definidas.
- **Cabeçalho verde claro:** faixa superior com navegação.

**The Estado Escrito Rule.** Cor acompanha um estado explícito; confirmação, cancelamento e conflito precisam de texto compreensível.

## Typography

**Display Font:** Manrope, com fallback sans-serif.
**Body Font:** Public Sans, com fallback sans-serif.

As fontes variáveis são servidas localmente em WOFF2 com `font-display: swap`. Manrope cobre pesos 200–800 e Public Sans 100–900. Não há fonte mono separada; horários usam algarismos tabulares.

### Hierarchy

- **Display:** título da entrada; reduz para 2.75rem até 900px e 2.5rem até 640px.
- **Headline:** título de página; no celular, o título operacional reduz para 1.7rem.
- **Title:** títulos de seção; subtítulos menores usam Manrope de 1rem.
- **Body:** texto corrente em Public Sans; parágrafos usam entrelinha confortável. O texto principal da entrada limita-se a 49ch.
- **Label:** rótulos de campos com peso intermediário e distância clara até o controle.
- **Wordmark:** marca em minúsculas; reduz para 1.5rem no celular.

Títulos usam espaçamento ligeiramente fechado e quebra balanceada. Metadados e horas usam 0.75rem; finalidade nas linhas móveis usa 0.875rem.

## Layout

O conteúdo principal limita-se a 1320px, centralizado, com padding de 40px 28px 64px. O cabeçalho e o rodapé alinham suas margens ao mesmo limite. O ritmo é fixo, com valores nomeados no frontmatter; não existe escala fluida global de espaçamento.

A agenda combina colunas `minmax(0, 1.45fr)` e `minmax(320px, 1fr)`, separadas pelo espaço de trabalho. O editor tem divisória à esquerda e recuo próprio. Início e fim ficam em duas colunas iguais. O resumo usa linhas superior e inferior, com data, intervalo, duração e zona legíveis.

Até 900px, a agenda usa duas colunas mais equilibradas, editor mínimo de 280px, intervalo de 24px e recuo de 24px. A barra de ferramentas pode quebrar linha. A legenda externa da zona desaparece, mas a zona continua no resumo do formulário.

Até 640px, o conteúdo usa padding de 28px 20px 40px. Agenda e editor se empilham com 28px de separação; a divisória do editor passa ao topo. A grade temporal desaparece e a lista mantém horário, finalidade e estado em linhas próprias. A barra de recursos e data conserva duas colunas, seguida pelos controles do dia. A navegação superior quebra linha e omite o link de autoria. O rodapé também se empilha.

**The Tempo Proporcional Rule.** Na grade desktop, posição e altura representam minutos reais; não aumentar um bloco curto para acomodar conteúdo que pertence à lista ou ao detalhe.

## Elevation & Depth

A interface não usa sombras. A hierarquia vem de fundos tonais, espaço, bordas e divisórias. Reservas ficam acima dos intervalos pela posição na trilha; o diálogo nativo usa backdrop `rgb(25 35 24/0.5)` para interromper a tarefa. Não adicionar elevação decorativa a campos ou seções.

## Shapes

Controles têm cantos discretos, blocos de reserva ligeiramente menores e diálogo mais arredondado, conforme os tokens. Linhas da lista e células temporais têm cantos retos. A marca usa uma abertura simples com topo arqueado e divisor vertical; não transformar essa geometria em ornamento recorrente.

## Components

### Buttons

Ações são diretas, com rótulos de verbo e altura mínima de 44px. A principal usa oliva e texto claro, com peso 600; secundárias usam superfície e borda de controle; ações destrutivas usam terra. Hover muda a cor em 160ms com `ease-out`, sem deslocamento. Disabled usa opacidade 0.55 e cursor `not-allowed`.

O foco de botões, links e campos tem contorno de 3px e offset de 3px. A preferência de movimento reduzido remove transições. Botões da navegação móvel têm mínimo de 32px; células temporais e blocos proporcionais não seguem a altura mínima dos controles de formulário.

### Inputs / Fields

Campos, select e textarea preservam interação nativa, superfície clara, borda de 1px e altura mínima de 44px. Rótulos explícitos precedem cada campo. Textarea redimensiona verticalmente. Início e fim informam intervalos de 15 minutos; o resumo apresenta duração e zona antes da confirmação.

### Navigation

Marca à esquerda e navegação curta à direita. Links usam oliva, sem sublinhado no cabeçalho; links de conteúdo mantêm sublinhado. O link de pular conteúdo aparece ao receber foco. A navegação tem nome acessível; a abertura da marca é decorativa e oculta à tecnologia assistiva. Não há variante visual de link ativo implementada.

### Status and feedback

Etiquetas de confirmação e cancelamento têm fundo tonal e texto explícito. A mensagem de sucesso usa `role="status"`; erros usam `role="alert"`. O formulário preserva o rascunho no conflito, move foco para o alerta e oferece atualizar a agenda ou usar a versão atual quando disponível.

### Agenda temporal

A grade cobre 9h–18h em 864px, com coluna de horas de 48px e 36 células iguais. A altura equivale a 24px por intervalo de 15 minutos. Blocos ocupam o tempo real, com recuos laterais de 8px. Até 15 minutos, mostram somente o horário com padding de 3px 6px e texto de 0.7rem. Até 30 minutos, acrescentam finalidade e usam padding de 6px 8px. Acima de 30 minutos, também mostram confirmação. Finalidades longas usam ellipsis; o nome acessível conserva intervalo, finalidade, estado e ação de histórico.

A lista de reservas fica disponível também no desktop. No celular, torna-se a representação principal e conserva o conteúdo que não cabe nos blocos. Seleção de intervalo e edição de início/fim compartilham os mesmos valores. A consulta visual indica ocupação; a confirmação depende da resposta do serviço.

### Dialog and history

O reset usa diálogo nativo de até 520px, largura `calc(100% - 32px)` e padding de 28px, reduzido para 24px no celular. A ação de manter ambiente recebe foco inicial. Tab/Shift+Tab circulam entre as ações; fechar devolve foco ao controle que abriu o diálogo. Texto explica o efeito do reset e os limites da demo. Durante envio, ações ficam desabilitadas e o cancelamento por Escape é bloqueado.

O histórico é uma lista ordenada sem marcadores visuais, com divisórias, eventos escritos, horários tabulares e intervalos antes/depois. O detalhe cancelado conserva histórico e informa leitura sem novas alterações.

## Do's and Don'ts

### Do:

- **Do** usar os tokens do frontmatter para ações, campos e estados recorrentes.
- **Do** manter horas explícitas e proporção temporal na grade.
- **Do** preservar a lista legível quando a grade deixa de caber.
- **Do** manter foco visível, rótulos e estados textuais em novos fluxos.
- **Do** manter duração, recurso e zona próximos da confirmação.

### Don't:

- **Don't** aumentar blocos curtos a ponto de representar outra duração.
- **Don't** depender apenas de cor ou arrastar para reservar.
- **Don't** adicionar sombras, gradientes ou textura simulada às superfícies existentes.
- **Don't** substituir controles e instruções claros por decoração de parque ou mapa.
- **Don't** ocultar cancelamento ou descartar o rascunho ao mostrar conflito.
