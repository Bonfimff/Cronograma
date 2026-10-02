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
    let texto = '';
    for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript;
    aoMudar(texto.replace(/\s+/g, ' ').trimStart());
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