# Inglês Híbrido

Estudo de inglês em ciclo **app → folha física → app**, ligado por QR Code.

```
npm install
npm run dev          # http://localhost:5173 (e no celular, pelo IP da rede)
npm run dev:https    # HTTPS local — necessário para a câmera ao vivo no celular
npm run build
```

## Estrutura

```
content/                 conteúdo (edite aqui, sem mexer no código)
  words.json             palavra → significados → usos → variações → exemplos
  expressions.json       expressões completas ligadas às palavras e padrões
  patterns.json          padrões reutilizáveis (How + be + sujeito?)
  grammar.json  examples.json  topics.json  exercises.json

src/core/                lógica pura, sem React (reaproveitável no Android)
  types.ts               todos os modelos
  content/               leitura e relações do conteúdo
  planning/              semanas e dias
  sessions/              criar, iniciar, finalizar sessões
  worksheets/            folhas, modelos (templates.ts) e QR → folha → sessão
  qrcodes/               códigos ENG-AAAA-NNNN (o QR guarda só o código, não uma URL)
  scanner/omr.ts         lê o QR, corrige a perspectiva pelos 4 cantos e detecta caixas marcadas
  lessons/               blocos da aula (explicação, exemplos, variações)
  exercises/             geração e correção de exercícios (com reciclagem)
  history/  reviews/     eventos por conteúdo e estado de revisão (revisão espaçada)
  storage/store.ts       persistência trocável (hoje: localStorage)

src/ui/                  interface React (telas e componentes)
```

Os dados do usuário (sessões, semanas, folhas impressas, folhas da Biblioteca, histórico) ficam no
navegador, com um único formato (`UserData`). Faça o backup em **Hoje → Backup dos dados** — ele leva
também os recordes dos jogos.

## Arquivos JSON

Dois arquivos entram no app: o **pacote semanal** (Semana → Montar semana) e o **backup**.
Formato, campos obrigatórios e o que acontece ao reimportar: [docs/formato-semana.md](docs/formato-semana.md).

## Folhas

`src/core/worksheets/templates.ts` descreve cada página nas coordenadas da referência: onde fica o QR Code,
as caixas de status e a área de conteúdo. O mesmo modelo serve para imprimir e para escanear.
Páginas: Dia de Estudo (frente com QR + verso com marcadores de canto), Plano semanal e Orientações — reproduzidas a partir das páginas de referência (1024×1536), impressas em A4 com a mesma proporção.

## Android (futuro)

`src/core` e `content/` não dependem do React nem do navegador (exceto `speak`, que usa a voz do sistema).
Com Capacitor, o app web roda como Android sem reescrita. Com React Native, basta reaproveitar `core`
e trocar o `StorageAdapter`.
