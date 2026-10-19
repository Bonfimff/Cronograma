import { useMemo, useState } from 'react';
import type { SyncRecord } from '../../../core/api/client';
import { simplificar } from '../../../core/content/search';
import { vocabularioCompleto, type EstadoPalavra } from '../../../core/planning/contextoAluno';
import { idDaPalavra, palavraNova } from '../../../core/planning/rascunhoAula';
import type { FraseAula, UserData } from '../../../core/types';

const ESTADOS: { e: EstadoPalavra; nome: string; dica: string }[] = [
  { e: 'quase_esquecida', nome: 'Quase esquecidas', dica: 'chance de lembrar abaixo de 85%: boas para revisar' },
  { e: 'estudando', nome: 'Estudando', dica: 'já praticadas, ainda firmando' },
  { e: 'firme', nome: 'Firmes', dica: 'lembra sozinho; boas de apoio nos exercícios' },
  { e: 'nao_praticada', nome: 'Não praticadas', dica: 'estão na lista, mas ainda não foram treinadas' },
];
const NOME_ESTADO: Record<EstadoPalavra, string> = { quase_esquecida: 'quase esquecida', estudando: 'estudando', firme: 'firme', nao_praticada: 'não praticada' };
const DEGRAUS = ['vista', 'reconhece', 'lembra sozinho', 'entende ouvindo', 'pronuncia', 'usa no chat'];

/** A lista completa do vocabulário do aluno, e o professor acrescenta palavras. */
export function VocabularioAluno({ dados, aluno, gravar, gravando }: {
  dados: UserData; aluno: string; gravar: (itens: SyncRecord[]) => Promise<boolean>; gravando: boolean;
}) {
  const itens = useMemo(() => vocabularioCompleto(dados), [dados]);
  const [termo, setTermo] = useState('');
  const [filtro, setFiltro] = useState<EstadoPalavra | null>(null);
  const t = simplificar(termo);
  const visiveis = itens.filter((i) => (!filtro || i.estado === filtro) && (!t || simplificar(`${i.en} ${i.pt}`).includes(t)));
  const conta = (e: EstadoPalavra) => itens.filter((i) => i.estado === e).length;
  const nome = aluno.split('@')[0];

  return (
    <>
      <section>
        <h2>Vocabulário de {nome} <small className="muted">{itens.length} itens</small></h2>
        <div className="seg" role="group" aria-label="Filtrar por situação">
          <button type="button" className={!filtro ? 'on' : ''} onClick={() => setFiltro(null)}>Todos ({itens.length})</button>
          {ESTADOS.map((x) => (
            <button key={x.e} type="button" title={x.dica} className={filtro === x.e ? 'on' : ''} onClick={() => setFiltro(filtro === x.e ? null : x.e)}>
              {x.nome} ({conta(x.e)})
            </button>
          ))}
        </div>
        <input className="voc-busca" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="buscar em inglês ou português" aria-label="Buscar no vocabulário" />
        {visiveis.length ? (
          <ul className="voc-lista">
            {visiveis.map((i) => (
              <li key={i.ref}>
                <span className="voc-en"><b>{i.en}</b><small className="muted">{i.classe}</small></span>
                <span className="voc-pt">{i.pt}</span>
                <span className={`voc-estado e-${i.estado}`} title={i.ref.startsWith('word:') && i.estado !== 'nao_praticada' ? `${Math.round(i.retencao * 100)}% de chance de lembrar hoje · ${DEGRAUS[i.degrau]}` : undefined}>
                  {NOME_ESTADO[i.estado]}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{itens.length ? 'Nada encontrado.' : 'O vocabulário ainda está vazio. Adicione a primeira palavra abaixo.'}</p>}
      </section>

      <NovaPalavra dados={dados} nome={nome} gravar={gravar} gravando={gravando} />
    </>
  );
}

const vazio = () => ({ en: '', pt: '', tipo: '', significado: '', ipa: '', exemplos: [{ en: '', pt: '' }] as FraseAula[] });

function NovaPalavra({ dados, nome, gravar, gravando }: {
  dados: UserData; nome: string; gravar: (itens: SyncRecord[]) => Promise<boolean>; gravando: boolean;
}) {
  const [p, setP] = useState(vazio);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const muda = (m: Partial<ReturnType<typeof vazio>>) => { setP((x) => ({ ...x, ...m })); setAviso(null); };
  const jaTem = (dados.content?.words ?? []).find((w) => w.id === idDaPalavra(p.en));

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (jaTem) { setAviso({ ok: false, texto: `"${jaTem.word}" já está no vocabulário de ${nome}.` }); return; }
    const { word, examples } = palavraNova(p);
    const ok = await gravar([
      { kind: 'content', id: `words:${word.id}`, data: word as unknown as Record<string, unknown> },
      ...examples.map((e) => ({ kind: 'content' as const, id: `examples:${e.id}`, data: e as unknown as Record<string, unknown> })),
    ]);
    if (ok) {
      setAviso({ ok: true, texto: `"${word.word}" entrou no vocabulário de ${nome}. Aparece para o aluno na próxima sincronização.` });
      setP(vazio());
    }
  };
  const ex = (i: number, m: Partial<FraseAula>) => muda({ exemplos: p.exemplos.map((x, j) => (j === i ? { ...x, ...m } : x)) });

  return (
    <form className="form paper-card" onSubmit={salvar}>
      <h2>Adicionar palavra</h2>
      <p className="muted small-text">Entra como "não praticada". Depois ela pode ser usada nas aulas e nos exercícios.</p>
      <div className="ed-grade">
        <label>Inglês *<input required value={p.en} onChange={(e) => muda({ en: e.target.value })} placeholder="order" /></label>
        <label>Tradução *<input required value={p.pt} onChange={(e) => muda({ pt: e.target.value })} placeholder="pedir" /></label>
        <label>Classe<input value={p.tipo} onChange={(e) => muda({ tipo: e.target.value })} placeholder="verbo" /></label>
        <label>Pronúncia<input value={p.ipa} onChange={(e) => muda({ ipa: e.target.value })} placeholder="/ˈɔːrdər/" /></label>
      </div>
      {jaTem && <p className="error">"{jaTem.word}" já está no vocabulário de {nome}.</p>}
      <label>Significado<input value={p.significado} onChange={(e) => muda({ significado: e.target.value })} placeholder="pedir algo num restaurante ou loja" /></label>
      <div>
        <h4>Exemplos</h4>
        <small className="ed-dica">Aparecem no cartão da palavra e nos exercícios gerados. Três é o ideal.</small>
        <div className="ed-lista">
          {p.exemplos.map((f, i) => (
            <div key={i} className="ed-linha ed-frase">
              <input value={f.en} onChange={(e) => ex(i, { en: e.target.value })} placeholder="Can I order now?" aria-label={`Exemplo ${i + 1} em inglês`} />
              <input value={f.pt} onChange={(e) => ex(i, { pt: e.target.value })} placeholder="Posso pedir agora?" aria-label={`Exemplo ${i + 1} em português`} />
              {p.exemplos.length > 1 && <button type="button" className="ghost small" aria-label="Tirar" onClick={() => muda({ exemplos: p.exemplos.filter((_, j) => j !== i) })}>×</button>}
            </div>
          ))}
          <button type="button" className="ghost small" onClick={() => muda({ exemplos: [...p.exemplos, { en: '', pt: '' }] })}>+ exemplo</button>
        </div>
      </div>
      {aviso && <p className={aviso.ok ? 'ok-line' : 'error'}>{aviso.texto}</p>}
      <div className="actions"><button className="primary" type="submit" disabled={gravando || !!jaTem}>{gravando ? 'Gravando…' : 'Adicionar ao vocabulário'}</button></div>
    </form>
  );
}
