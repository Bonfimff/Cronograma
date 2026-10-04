// Teste rápido do pacote semana@2 (rodado com esbuild + node; não faz parte do app).
import { checkPackage, applyPackage, templatePackage, exportPackage } from '../src/core/planning/weekPackage';
import type { UserData } from '../src/core/types';

const vazio = (): UserData => ({ version: 1, counter: {}, weeks: [], sessions: [], worksheets: [], history: [], chat: [], atividades: [] });
let falhas = 0;
const confere = (nome: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}`, ok ? '' : JSON.stringify(extra)); if (!ok) falhas++; };

// 1. o modelo comentado passa na própria conferência
const data = vazio();
const modelo = templatePackage('2026-10-05');
const c1 = checkPackage(data, modelo, { replacePlanned: false });
confere('modelo sem erros', c1.ok, c1.errors);
console.log('   integração do modelo:', c1.integracao.map((i) => (i.ok ? '✓ ' : '⚠ ') + i.texto));

// 2. aplica o modelo e confere os campos novos
applyPackage(data, modelo, { replacePlanned: false });
const s = data.sessions.find((x) => x.title === 'Where do you work?')!;
confere('palavras gravadas', s.palavras?.novas?.[0] === 'word:work', s.palavras);
confere('aula gravada', s.aula?.missao?.tarefas.length === 2, s.aula);
confere('treino gravado', s.treino?.[0].resposta === 'I work at ____.', s.treino);
confere('refs = refs + novas + revisar', ['pattern:pergunta-com-do', 'word:work', 'word:where'].every((r) => s.refs.includes(r as never)), s.refs);
const total = data.sessions.length;

// 3. aula avulsa, sem week e sem id: atualiza a mesma aula (mesmo dia, mesmo título)
const avulsa = { format: 'ingles-hibrido/semana@2', days: [{ date: s.date, sessions: [{ kind: 'practice', title: 'where do you work?', refs: ['word:work'] }] }] };
const c3 = checkPackage(data, avulsa as never, { replacePlanned: false });
confere('aula avulsa sem erros', c3.ok, c3.errors);
confere('aula avulsa atualiza (não cria)', c3.summary.plan.update.length === 1 && c3.summary.plan.create === 0, c3.summary.plan);
applyPackage(data, avulsa as never, { replacePlanned: false });
confere('nenhuma sessão nova', data.sessions.length === total, data.sessions.length);
confere('aula mudou para practice', data.sessions.find((x) => x.id === s.id)!.kind === 'practice');

// 4. outros dias intactos
const outros = data.sessions.filter((x) => x.date !== s.date).map((x) => x.title);
confere('outros dias continuam', outros.length === total - 1, outros);

// 5. substituir só vale para os dias do arquivo
const c5 = checkPackage(data, { format: 'ingles-hibrido/semana@2', days: [{ date: '2026-10-09', sessions: [] }] } as never, { replacePlanned: true });
confere('substituir remove só a aula de 09/10', c5.summary.plan.remove.length === 1, c5.summary.plan);

// 6. habilidade inválida e aula malformada viram erro
const ruim = { format: 'ingles-hibrido/semana@2', days: [{ date: '2026-10-07', sessions: [{ kind: 'new', title: 'x', palavras: { novas: ['word:work'] }, aula: { escuta: [{ en: 'a' }] }, exercises: [{ type: 'choice', habilidade: 'voar', prompt: 'p', options: ['a'], answer: 'a' }] }] }] };
const c6 = checkPackage(data, ruim as never, { replacePlanned: false });
confere('erros de habilidade e escuta', c6.errors.some((e) => e.includes('habilidade')) && c6.errors.some((e) => e.includes('aula.escuta')), c6.errors);

// 7. cobertura: palavras fora do vocabulário aparecem no alerta
const fora = { format: 'ingles-hibrido/semana@2', days: [{ date: '2026-10-08', sessions: [{ kind: 'new', title: 'Cobertura', refs: ['word:work'], exercises: [
  { type: 'translate', habilidade: 'lembrar', prompt: 'The quarterly reconciliation spreadsheet requires meticulous attention tomorrow morning', answer: 'xxx' },
] }] }] };
const c7 = checkPackage(data, fora as never, { replacePlanned: false });
const cob = c7.integracao.find((i) => i.texto.includes('palavras conhecidas'));
confere('cobertura baixa alertada', !!cob && !cob.ok && cob.texto.includes('reconciliation'), c7.integracao);

// 8. exportar traz o bloco aluno e os campos novos (numa semana recém-importada)
const limpo = vazio();
applyPackage(limpo, templatePackage('2026-10-05'), { replacePlanned: false });
const exp = exportPackage(limpo, '2026-10-05');
confere('export com aluno', !!exp.aluno && Array.isArray(exp.aluno.vocabulario), exp.aluno);
confere('export com aula/palavras', exp.days.some((d) => d.sessions?.some((x) => x.palavras && x.aula)));

// 9. arquivo @1 continua valendo
const c9 = checkPackage(vazio(), { ...modelo, format: 'ingles-hibrido/semana@1' }, { replacePlanned: false });
confere('@1 aceito sem aviso de formato', c9.ok && !c9.warnings.some((w) => w.includes('"format"')), c9.warnings);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
if (falhas) process.exit(1);
