// Teste rápido do texto enviado à voz (rodado com esbuild + node; não faz parte do app).
import { textoParaFalar } from '../src/core/lessons/vozes';

let falhas = 0;
const confere = (nome: string, obtido: string, esperado: string) => {
  const ok = obtido === esperado;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${obtido}`);
  if (!ok) { falhas++; console.log(`      esperado: ${esperado}`); }
};

confere('palavra solta ganha ponto', textoParaFalar('are', 'en', 1), 'are.');
confere('palavra solta no lento: igual (repete, não estica)', textoParaFalar('good', 'en', 0.5), 'good.');
confere('frase normal: sem mudança', textoParaFalar('Where do you work?', 'en', 1), 'Where do you work?');
confere('frase no lento: pausa entre palavras', textoParaFalar('Where do you work?', 'en', 0.5), 'Where, do, you, work?');
confere('frase no lento sem pontuação', textoParaFalar("I don't work on Sundays", 'en', 0.5), "I, don't, work, on, Sundays.");
confere('frase com vírgula no lento', textoParaFalar('Yes, I do.', 'en', 0.5), 'Yes, I, do.');
confere('português não muda', textoParaFalar('Onde você trabalha?', 'pt', 0.5), 'Onde você trabalha?');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
if (falhas) process.exit(1);
