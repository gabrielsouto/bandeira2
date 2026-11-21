# Bandeira 2 (protótipo)

Jogo arcade top-down em pixel art: você é motorista de aplicativo numa cidade inventada.
Tudo é desenhado e sintetizado por código (sem arquivos de arte ou som).

**Jogue online:** https://gabrielsouto.github.io/bandeira2/ · **Ajuda com todas as regras:** [ajuda.html](ajuda.html) (também abre pela tela inicial e pela pausa)

## Como rodar localmente

O jogo é HTML + JavaScript puro, sem build. Basta servir a pasta e abrir no navegador:

```
python -m http.server 8642
```

Depois acesse http://localhost:8642. (Abrir o `index.html` direto com duplo clique também funciona na maioria dos navegadores.)

## Multiplayer (em construção)

Até 4 amigos na mesma cidade, numa sala aberta por link (`?sala=K7QF`), disputando um turno das 07:00 às 19:00 (12 minutos reais). Todos veem os outros dirigindo e podem bater neles.

- **Espera:** quem criou a sala (o dono; se ele sair, o mais antigo) aperta **Enter** para começar. Até lá dá para dar voltas, mas não há chamadas e o posto e a oficina ficam fechados. Durante o turno só volta quem já estava nele.
- **Turno:** todos largam iguais (R$ 150, carro do save novo), depois de um 3-2-1. As chamadas e as áreas de dinâmica vêm do servidor e são as mesmas para todos: no celular aparece a lista, **E** vai buscar a chamada destacada e **Q** passa para a próxima. Ir buscar não reserva nada: leva a corrida quem parar ao lado do passageiro primeiro.
- **Caixa:** o dinheiro mora no servidor. Ele paga as corridas, cobra as taxas de cancelamento e confere cada compra no posto e na oficina pelo teto de cada item e pelo limite do fiado (−R$ 200). Guincho e multa são cobrados mesmo sem dinheiro. O placar ao vivo fica no canto superior esquerdo.
- **19:00:** quem está com passageiro tem 30 s de prorrogação para entregar. Depois vem o ranking (lucro do turno, desempate pela nota média), e o dono pode pedir **revanche**.
- **Veículo:** cada um escolhe o seu na tela inicial (Rebu, 66, Táxi ou Moto Rebu) e os outros veem o formato certo. A sala paga a corrida com o multiplicador do veículo; executivo não anda de moto.
- **Pega:** **X** chama um pega com a largada onde você está; a sala sorteia a chegada. Quem parar na largada e apertar **X** em 20 s entra. Depois do 3-2-1 (carro travado), ganha quem chegar primeiro. Durante o turno cada piloto paga R$ 20 de inscrição e o vencedor leva o pote; se ninguém chegar, a inscrição volta. Fora do turno é só pela glória. Quem está no pega não pega passageiro.
- Polícia, bandidos e colégios são de cada um (não aparecem para os outros), mas as multas, o assalto e a franquia do seguro passam pelo caixa da sala.

O dinheiro da sala não mexe no save do single player.

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
| `?turno=2` | turno de 2 minutos (só vale no servidor local) |
| `?hora=21` | começa o solo às 21:00 (para ver a noite) |

Testes do servidor:

```
npm test                       # regras da sala (disputa, pagamento, atraso...), sem rede
npm run fumaca                 # ponta a ponta no servidor local (precisa do npm run dev), com um turno de 30 s
node test/robo.mjs TEST        # um jogador falso disputando corridas na sala TEST
VOLTAS=1 node test/robo.mjs TEST   # o mesmo robô só dando voltas num quarteirão
node test/pega-bot.mjs TEST        # um piloto falso (de moto) que entra em qualquer pega aberto na sala TEST
CRIAR=1 node test/pega-bot.mjs TEST   # o mesmo, mas ele mesmo chama o pega
COMECAR=1 TURNO=1 TURNOS=3 node test/robo.mjs TEST   # se for o dono, joga 3 turnos de 1 min seguidos
                                                    # e confere o próprio saldo com o ranking em cada um
```

As regras da sala ficam em `server/src/regras.js` (lógica pura, sem rede) e usam as mesmas fórmulas de tarifa, nota e gorjeta do solo (`js/rides.js`) e os mesmos preços (`js/carcare.js`). Cada mudança de dinheiro vira uma linha no livro-caixa da sala; no fim do turno o servidor confere o saldo de cada um com a soma do livro e escreve o resultado no log (`npx wrangler tail`).

Servidor publicado: `wss://bandeira2-servidor.gabrielsouto.workers.dev` (plano grátis da Cloudflare). Para publicar uma versão nova: `npx wrangler login` (uma vez) e `npm run deploy` dentro de `server/`. Publique sempre o servidor antes do jogo. Quando a versão do protocolo muda (`PROTO` em `server/src/sala.js` e `NET_PROTO` em `js/net.js`), quem estiver com o jogo antigo aberto recebe um aviso para recarregar a página. O endereço fica em `NET_SERVER_PROD`, no topo de `js/net.js`; se ele estiver vazio, o site publicado esconde o multiplayer.

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | dirigir |
| Espaço | freio de mão (derrapagem) |
| E / Q | aceitar / recusar corrida |
| C | cancelar corrida |
| H | buzina |
| R | rádio (troca a estação; no fim do turno da sala, abre o ranking) |
| X | pega (multiplayer): chamar, entrar ou desistir |
| 1–7 | escolher Rebu, 66, Táxi, Moto Rebu, euComida, 66Comida ou Autoescola |
| 8 / 9 / 0 | escolher Mercado Leve, Amazoom ou Xopi |
| V | voltar ao galpão com a carga restante durante uma rota de encomendas |
| O / P / L | seta até a oficina, o posto ou o lava jato mais perto (a mesma tecla cancela) |
| G | guincho (quando o carro quebra ou fica sem gasolina; não cobra se você já está lá) |
| F | liga/desliga a direção fácil |
| M | liga/desliga o som |
| Esc | pausa |

## O que já existe

- Cidade procedural (grade de ruas com calçadões, prédios, praças, árvores, água na borda).
- Física arcade com derrapagem, marcas de pneu e batidas.
- Trânsito na mão direita que faz curvas, para atrás de obstáculos e buzina se você fechar a rua.
- Pedestres que pulam pro lado (e multa se você atropelar).
- Corridas: ofertas no celular, buscar, levar, prazo, avaliação, gorjeta.
- Tipos de passageiro: normal, com pressa, enjoa fácil (pode sujar o carro), executivo, voltando da praia (sempre suja o carro).
- Veículos: Rebu (equilibrado), 66 (tarifa menor, mais chamadas, econômico), Táxi (tarifa maior e bandeira 2 das 20:00 às 06:00) e Moto Rebu (ágil, tanque barato, tarifa 40% menor, sem executivo, tombo dói).
- Entregador do **euComida** (5º veículo, só no solo): moto com bag que leva pedidos de 8 restaurantes (toldo listrado, rosa no minimapa) até o cliente. A cozinha pode estar preparando, a comida esfria, pizza e pedido de festa não aguentam batida, açaí derrete e o refri vaza com derrapada.
- Entregador de bike do **66Comida** (6º veículo, só no solo): os mesmos pedidos, mas de bicicleta. Não gasta gasolina: a barra do tanque vira **fôlego**, que cai pedalando e volta parado (ou com um café no posto). Mais lenta, só pedidos perto, sem pedido de festa e com mais prazo.
- **Direção fácil** (tecla F, botão na tela inicial ou pausa): carro mais lento que quase não derrapa, volante que se endireita sozinho, raspa no muro em vez de quicar e freio automático na frente de pedestres e carros. No solo, também estraga menos, não quebra sozinho e gasta menos gasolina.
- No solo, as vans do **Mercado Leve** e da **Amazoom** fazem rotas de até 12 pacotes. A **Xopi** oferece rotas curtas de até 5 pacotes na moto. Carregue no galpão, escolha as paradas no minimapa e volte à doca para receber pelas coletas e pelo bônus de rota perfeita.
- **Autoescola** (7º veículo, só no solo): busque o instrutor e siga as setas pintadas nos cruzamentos. O instrutor fala o que fazer (voz do navegador), tira pontos por batida, excesso de velocidade, calçada, contramão e PARE furado, e dá de 0 a 3 estrelas. 6 aulas (a última é a prova do DETRAN, que dá a carteira) e depois treino livre. Não mexe no dinheiro nem no save.
- Dia e noite: o relógio anda 1 minuto por segundo; à noite escurece, com faróis, postes e giroflex.
- Rádio do carro com estações sintetizadas (funk, sertanejo, pagode) e uma estação de notícias falada pela voz do navegador.
- Posto Preço Baixo: gasolina 40% mais barata, mas batizada. Rende menos, o motor fica fraco e engasga, e o desgaste sobe. Abastecer em outro posto dilui.
- Lava jato: carro sujo (vômito ou areia) só sai lá. A sujeira derruba a nota dos passageiros.
- Áreas de risco (círculos vermelhos): bandidos se aproximam de quem para ou anda devagar e levam dinheiro, o carro ou os dois. Carro roubado volta pelo seguro na oficina, com franquia. Acelere para fugir. Atropelar bandido não dá multa: dá **AURA**, e quem tem muita aura assusta os bandidos.
- Colégios: na entrada e na saída das aulas (06:45–07:30, 11:45–12:30, 17:15–18:00) a rua da frente engarrafa e crianças atravessam. Radar de 40 km/h na zona escolar.
- Polícia: atropelar alguém, passar no radar ou bater numa viatura põe a polícia atrás de você. Parado com a viatura colada = multa e perde a corrida. Despistar (ficar bem longe por 6 s) dá AURA.
- Semáforos em metade dos cruzamentos de 3 ou 4 saídas: verde, amarelo e vermelho, com faixa branca antes do cruzamento. O trânsito para no vermelho. Avançar o vermelho = multa de radar (R$ 60); na direção fácil do solo é só um aviso; na autoescola tira 15 pontos.
- Tarifa dinâmica em áreas aleatórias que aparecem e somem.
- Carro com combustível, lataria, desgaste e defeitos aleatórios (pneu furado, radiador, freio, bateria).
- Postos, oficinas e lava jatos: entre devagar no pátio para abrir o menu. Dá pra pagar no fiado até -R$ 200. Quebrou ou ficou sem gasolina sem dinheiro nem no fiado: a oficina faz um remendo grátis e o frentista empresta um pouco de gasolina, para ninguém ficar preso.
- Gatos e cachorros nas calçadas: atropelar um tira 15 de AURA.
- Save automático no navegador (localStorage).

## Estrutura

```
js/util.js         utilidades (aleatório, cores, pixels)
js/city.js         geração da cidade
js/render-city.js  arte gerada por código (mapa, carros, ícones)
js/car.js          física e colisão do jogador
js/vehicles.js     veículos, capacidades, física, tarifa e consumo
js/facil.js        direção fácil (física mais mansa, volante que se endireita, freio automático)
js/autoescola.js   modo autoescola: instrutor, caminho da aula, faltas, estrelas e carteira
js/parcels.js      rotas de encomendas, galpões, paradas e devoluções
js/delivery.js     entregador do euComida e do 66Comida: restaurantes, pedidos, nota da entrega
js/light.js        dia e noite (escuridão, faróis, postes)
js/radio.js        rádio do carro (música sintetizada e notícias faladas)
js/world.js        áreas de risco com bandidos (e AURA), gatos e cachorros, colégios com trânsito
js/police.js       perseguição da polícia
js/semaforo.js     semáforos: ciclo das luzes, trânsito parando no vermelho, multa de quem avança
ajuda.html         página de ajuda com todas as regras
js/traffic.js      trânsito
js/peds.js         pedestres
js/rides.js        corridas e tarifa dinâmica
js/carcare.js      combustível, danos e defeitos
js/hud.js          interface (celular, painel, minimapa)
js/net.js          conexão com a sala (WebSocket, reconexão, ping, atraso simulado)
js/multi.js        multiplayer no jogo (entrada na sala, rivais, interpolação, colisão)
js/rides-net.js    corridas disputadas da sala (chamadas do servidor, embarque, pagamento)
js/pega.js         pega no multiplayer (largada, chegada, contagem, resultado)
js/main.js         loop, câmera, desenho, menus, save
server/            servidor das salas (Cloudflare Durable Objects)
```

## Ideias para depois

- Semáforos.
- Comprar carros novos e upgrades.
- Bairros com cara própria, eventos (chuva, show, jogo de futebol gerando demanda).
- Sprites desenhados à mão no lugar da arte gerada por código.
