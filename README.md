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
js/main.js         loop, câmera, desenho, menus, save
```

## Ideias para depois

- Dia e noite (faróis, corridas noturnas com bandeira 2).
- Semáforos e polícia.
- Comprar carros novos e upgrades.
- Bairros com cara própria, eventos (chuva, show, jogo de futebol gerando demanda).
- Sprites desenhados à mão no lugar da arte gerada por código.
