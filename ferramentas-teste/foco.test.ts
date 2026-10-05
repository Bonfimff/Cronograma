// Teste rápido do foco de estudo (rodado com esbuild + node; não faz parte do app).
import { aulaEmFoco, comFoco, focoDeEstudo, palavrasDaSessao, palavrasDoFoco } from '../src/core/estudo/foco';
import { setUserContent } from '../src/core/content/repository';
import type { Session, UserData, Word } from '../src/core/types';

let falhas = 0;
const confere = (nome: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}`, ok ? '' : JSON.stringify(extra)); if (!ok) falhas++; };

const palavra = (id: string, word: string, pt: string): Word => ({
  id, word, type: 'palavra', translations: [{ text: pt }], core_meaning: pt, uses: [], variations: [], related_words: [], examples: [], pronunciation: { ipa: '' },
});
const words = [palavra('work', 'work', 'trabalho'), palavra('free', 'free', 'livre'), palavra('tired', 'tired', 'cansado'), palavra('ship', 'ship', 'navio')];
setUserContent({ words, expressions: [{ id: 'thank-you', text: 'Thank you!', translation: 'Obrigado', words: [], context: '', meaning: '', examples: [] }] });

const hoje = '2026-10-05';
const sessao = (id: string, status: Session['status'], date = hoje, extra: Partial<Session> = {}): Session => ({
  id, date, weekStart: '2026-10-05', kind: 'new', title: `Aula ${id}`, objective: '', refs: ['word:work', 'expression:thank-you'],
  copyRefs: [], status, createdAt: `${date}T08:00:00Z`, ...extra,
});

// atividades de 10 dias atrás com erros em ship: deve estar quase esquecida hoje
const dezDias = new Date('2026-09-25T10:00:00Z').toISOString();
const data: UserData = {
  version: 1, counter: {}, weeks: [], worksheets: [], history: [], chat: [],
  sessions: [sessao('A', 'done', '2026-10-04'), sessao('B', 'planned', hoje, { palavras: { revisar: ['word:free'] } })],
  atividades: [{ id: 'x', quando: dezDias, tipo: 'jogo', origem: 'flashcards', duracaoSeg: 60, acertos: 1, erros: 1, palavras: [{ en: 'ship', ok: true, hab: 'lembrar' }, { en: 'ship', ok: false, hab: 'lembrar', t: 5 }] }],
};

confere('palavras da sessão (palavra + expressão sem pontuação + revisar)', JSON.stringify(palavrasDaSessao(data.sessions[1])) === JSON.stringify(['work', 'Thank you', 'free']), palavrasDaSessao(data.sessions[1]));
confere('aula de hoje ainda não feita vem primeiro', aulaEmFoco(data, hoje)?.sessao.id === 'B', aulaEmFoco(data, hoje)?.sessao.id);
data.sessions.push(sessao('C', 'in_progress', '2026-10-03', { startedAt: '2026-10-03T10:00:00Z' }));
confere('aula pela metade tem prioridade e pode continuar', aulaEmFoco(data, hoje)?.sessao.id === 'C' && aulaEmFoco(data, hoje)?.continuar === true);

const f = focoDeEstudo(data, hoje);
confere('ship está quase esquecida', f.revisar.some((p) => p.en === 'ship'), f.revisar);
confere('foco: aula primeiro, depois as quase esquecidas', f.palavras[0] === 'work' && f.palavras.includes('ship'), f.palavras);

confere('?foco=revisar', palavrasDoFoco(data, 'revisar').includes('ship'));
confere('?foco=aula:B', palavrasDoFoco(data, 'aula:B').includes('free'));
confere('?foco=palavras:a,b', JSON.stringify(palavrasDoFoco(data, 'palavras:work, tired')) === '["work","tired"]', palavrasDoFoco(data, 'palavras:work, tired'));
confere('sem foco, lista vazia', palavrasDoFoco(data, null).length === 0 && palavrasDoFoco(data, 'tudo').length === 0);

const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'work', 'free'].map((en) => ({ en }));
const focado = comFoco(pool, ['free', 'work'], (x) => x.en, 6);
confere('comFoco: focadas + completa até o mínimo', focado.length === 6 && focado[0].en === 'work' && focado[1].en === 'free', focado);
confere('comFoco: sem foco devolve tudo', comFoco(pool, [], (x) => x.en).length === pool.length);
confere('comFoco: foco fora do conjunto devolve tudo', comFoco(pool, ['zzz'], (x) => x.en).length === pool.length);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
if (falhas) process.exit(1);
