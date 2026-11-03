/**
 * Ditado: transforma a fala em texto enquanto a pessoa fala, para a caixa da conversa.
 *
 * Usa o reconhecimento do próprio navegador (Chrome, Edge, Safari). Ele escreve em
 * tempo real, o que um modelo rodando no celular não consegue. Onde o navegador
 * oferece reconhecimento no aparelho, ele é pedido; senão o navegador usa o serviço
 * dele. Navegadores sem reconhecimento (o Firefox) não mostram o microfone.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const Reconhecedor: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

export const ditadoDisponivel = !!Reconhecedor;

// o Chrome novo diz se reconhece português no aparelho, sem mandar o áudio para fora
let noAparelho = false;
if (Reconhecedor?.available) {
  Promise.resolve(Reconhecedor.available({ langs: ['pt-BR'], processLocally: true }))
    .then((s: string) => { noAparelho = s === 'available'; })
    .catch(() => { /* sem essa informação, o navegador decide */ });
}

export interface Ditado {
  parar: () => void;
  /** Encerra sem entregar o que foi ouvido. */
  cancelar?: () => void;
}

const comparavel = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Junta os resultados do reconhecedor num texto só. No computador, cada resultado é um trecho
 * novo. No Chrome do Android, cada um repete o anterior e acrescenta o que veio depois ("yes",
 * "Yes", "Yes já", "Yes já comecei"): emendar direto escrevia a frase várias vezes.
 */
export function juntarResultados(resultados: string[]): string {
  const trechos: string[] = [];
  for (const r of resultados) {
    const atual = comparavel(r);
    if (!atual) continue;
    const ultimo = comparavel(trechos[trechos.length - 1] ?? '');
    if (ultimo && atual.startsWith(ultimo)) trechos[trechos.length - 1] = r;
    else if (!ultimo || !ultimo.startsWith(atual)) trechos.push(r);
  }
  return trechos.map((t) => t.trim()).join(' ');
}

/**
 * Começa a ouvir. `aoMudar` recebe todo o texto falado até agora (o que já é certo
 * mais o que ainda está sendo reconhecido); `aoTerminar` é chamado quando para,
 * com uma mensagem se houve erro.
 */
export function ditar(lingua: string, aoMudar: (texto: string) => void, aoTerminar: (erro?: string) => void): Ditado {
  const r = new Reconhecedor();
  r.lang = lingua;
  r.continuous = true;
  r.interimResults = true;
  if (noAparelho) {
    try { r.processLocally = true; } catch { /* o navegador decide */ }
  }

  r.onresult = (e: any) => {
    const resultados: string[] = [];
    for (let i = 0; i < e.results.length; i++) resultados.push(e.results[i][0].transcript);
    aoMudar(juntarResultados(resultados).replace(/\s+/g, ' '));
  };
  let erro: string | undefined;
  r.onerror = (e: any) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') erro = 'O microfone foi bloqueado. Permita o acesso nas configurações do navegador.';
    else if (e.error !== 'no-speech' && e.error !== 'aborted') erro = 'Não consegui ouvir. Tente de novo.';
  };
  r.onend = () => aoTerminar(erro);
  r.start();
  return { parar: () => { try { r.stop(); } catch { /* já parou */ } } };
}

/**
 * Ouve uma frase e para sozinho quando a pessoa fica em silêncio, para a conversa por voz.
 * `aoTerminar` recebe o que foi dito; vazio quando ninguém falou.
 */
export function ouvirFrase(
  lingua: string, aoMudar: (texto: string) => void, aoTerminar: (texto: string, erro?: string) => void,
): Ditado & { cancelar: () => void } {
  const r = new Reconhecedor();
  r.lang = lingua;
  r.continuous = false;
  r.interimResults = true;
  if (noAparelho) {
    try { r.processLocally = true; } catch { /* o navegador decide */ }
  }
  let texto = '';
  let erro: string | undefined;
  let cancelado = false;
  r.onresult = (e: any) => {
    const resultados: string[] = [];
    for (let i = 0; i < e.results.length; i++) resultados.push(e.results[i][0].transcript);
    texto = juntarResultados(resultados).replace(/\s+/g, ' ');
    aoMudar(texto);
  };
  r.onerror = (e: any) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') erro = 'O microfone foi bloqueado. Permita o acesso nas configurações do navegador.';
    else if (e.error !== 'no-speech' && e.error !== 'aborted') erro = 'Não consegui ouvir. Toque na esfera para tentar de novo.';
  };
  r.onend = () => { if (!cancelado) aoTerminar(texto, erro); };
  r.start();
  return {
    parar: () => { try { r.stop(); } catch { /* já parou */ } },
    cancelar: () => { cancelado = true; try { r.abort(); } catch { /* já parou */ } },
  };
}
