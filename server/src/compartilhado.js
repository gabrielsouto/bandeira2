// Código do jogo reaproveitado no servidor: util.js, city.js e as fórmulas de rides.js.
// Esses arquivos são scripts do navegador que, no Node/Workers, exportam o que é compartilhado.
import util from '../../js/util.js';
import cidadeMod from '../../js/city.js';
import corridasMod from '../../js/rides.js';

// city.js e rides.js usam funções de util.js (mulberry32, clamp) como globais, igual no navegador
Object.assign(globalThis, util);

export const SEED = 20261118; // a mesma do save padrão do jogo (defaultSave em main.js)

// Gerada uma vez, quando o módulo carrega: na Cloudflare isso conta como tempo de inicialização,
// que tem folga maior que o limite de CPU de cada mensagem (gerar a cidade a frio leva ~20 ms).
export const CIDADE = cidadeMod.generateCity(SEED);
export const HASH_CIDADE = cidadeMod.cityHash(CIDADE);

export const { FIRST_NAMES, PTYPES, pickType, rideFare, rideAllowed, rideStars, ridePay } = corridasMod;
export const { clamp } = util;
