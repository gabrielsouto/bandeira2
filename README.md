# Bandeira 2 (protótipo)

Jogo arcade top-down em pixel art: você é motorista de aplicativo numa cidade inventada.
Tudo é desenhado e sintetizado por código (sem arquivos de arte ou som).

**Jogue online:** https://gabrielsouto.github.io/bandeira2/

## Como rodar localmente

O jogo é HTML + JavaScript puro, sem build. Basta servir a pasta e abrir no navegador:

```
python -m http.server 8642
```

Depois acesse http://localhost:8642. (Abrir o `index.html` direto com duplo clique também funciona na maioria dos navegadores.)

## Multiplayer (em construção)

Até 4 amigos na mesma cidade, numa sala aberta por link (`?sala=K7QF`). Por enquanto (etapa A) cada um vê os outros dirigindo e pode bater neles; as corridas ainda são de cada um. O dinheiro da sala não mexe no save do single player.

O jogo continua sem build. Só o servidor das salas (pasta `server/`, Cloudflare Durable Objects) precisa de Node:

```
cd server
npm install
npm run dev        # servidor local em ws://localhost:8787
```

Com o servidor local rodando, abra `http://localhost:8642/?sala=TEST` em **duas janelas lado a lado** (não em duas abas da mesma janela: o navegador congela a aba que fica escondida). Parâmetros úteis:

| Parâmetro | Para quê |
|---|---|
| `?lag=200` | soma 200 ms de ida e volta |
| `?jitter=60` | soma até 60 ms aleatórios por mensagem |
| `?servidor=ws://host:porta` | usa outro servidor |

Testes do servidor (com o `npm run dev` rodando em outro terminal):

```
npm run fumaca                 # confere entrada, repasse, recusas e saída
node test/robo.mjs TEST        # um jogador falso dando voltas na sala TEST
```

Servidor publicado: `wss://bandeira2-servidor.gabrielsouto.workers.dev` (plano grátis da Cloudflare). Para publicar uma versão nova: `npx wrangler login` (uma vez) e `npm run deploy` dentro de `server/`. Publique sempre o servidor antes do jogo. O endereço fica em `NET_SERVER_PROD`, no topo de `js/net.js`; se ele estiver vazio, o site publicado esconde o multiplayer.

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | dirigir |
| Espaço | freio de mão (derrapagem) |
| E / Q | aceitar / recusar corrida |
| C | cancelar corrida |
| H | buzina |
| G | guincho (quando o carro quebra ou fica sem gasolina) |
| M | liga/desliga o som |
| Esc / P | pausa |

## O que já existe

- Cidade procedural (grade de ruas com calçadões, prédios, praças, árvores, água na borda).
- Física arcade com derrapagem, marcas de pneu e batidas.
- Trânsito na mão direita que faz curvas, para atrás de obstáculos e buzina se você fechar a rua.
- Pedestres que pulam pro lado (e multa se você atropelar).
- Corridas: ofertas no celular, buscar, levar, prazo, avaliação, gorjeta.
- Tipos de passageiro: normal, com pressa, enjoa fácil (pode sujar o carro), executivo.
- Tarifa dinâmica em áreas aleatórias que aparecem e somem.
- Carro com combustível, lataria, desgaste e defeitos aleatórios (pneu furado, radiador, freio, bateria).
- Postos e oficinas: entre devagar no pátio para abrir o menu. Dá pra pagar no fiado até -R$ 200.
- Save automático no navegador (localStorage).

## Estrutura

```
js/util.js         utilidades (aleatório, cores, pixels)
js/city.js         geração da cidade
js/render-city.js  arte gerada por código (mapa, carros, ícones)
js/car.js          física e colisão do jogador
js/traffic.js      trânsito
js/peds.js         pedestres
js/rides.js        corridas e tarifa dinâmica
js/carcare.js      combustível, danos e defeitos
js/hud.js          interface (celular, painel, minimapa)
js/net.js          conexão com a sala (WebSocket, reconexão, ping, atraso simulado)
js/multi.js        multiplayer no jogo (entrada na sala, rivais, interpolação, colisão)
js/main.js         loop, câmera, desenho, menus, save
server/            servidor das salas (Cloudflare Durable Objects)
```

## Ideias para depois

- Dia e noite (faróis, corridas noturnas com bandeira 2).
- Semáforos e polícia.
- Comprar carros novos e upgrades.
- Bairros com cara própria, eventos (chuva, show, jogo de futebol gerando demanda).
- Sprites desenhados à mão no lugar da arte gerada por código.
