import { useData } from '../hooks';
import { store, emptyData } from '../../core/storage/store';
import { makeBackup, readBackup, restoreGames } from '../../core/storage/backup';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Backup: os dados do usuário ficam no navegador; exporte para não perder. */
export function DataPage() {
  const data = useData();
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(makeBackup(data), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ingles-hibrido-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importJson = async (f?: File) => {
    if (!f) return;
    const r = readBackup(await f.text());
    if (typeof r === 'string') return alert(r);
    const d = r.data;
    const resumo = `${count(d.sessions.length, 'sessão', 'sessões')}, ${count(d.sheets?.length ?? 0, 'folha', 'folhas')} da Biblioteca, `
      + count(d.history.length, 'registro', 'registros') + ' no histórico'
      + (Object.keys(r.games).length ? ' e os dados dos jogos' : '')
      + (r.dropped ? ` (${count(r.dropped, 'sessão danificada ficou', 'sessões danificadas ficaram')} de fora)` : '');
    if (confirm(`Substituir os dados atuais pelos do arquivo?\n\n${resumo}.`)) {
      store.replace(d);
      restoreGames(r.games);
    }
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Dados</p>
        <h1>Backup</h1>
        <p className="lead">
          {count(data.sessions.length, 'sessão', 'sessões')} · {count(data.worksheets.length, 'folha impressa', 'folhas impressas')} ·{' '}
          {count(data.sheets?.length ?? 0, 'folha', 'folhas')} na Biblioteca · {count(data.history.length, 'registro', 'registros')} no histórico. Tudo fica salvo neste navegador; o backup leva também os recordes dos jogos.
        </p>
      </section>
      <section className="actions left">
        <button className="primary" onClick={exportJson}>Exportar JSON</button>
        <label className="ghost file">Importar JSON<input type="file" accept="application/json" onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button className="link" onClick={() => confirm('Apagar todos os dados locais?') && store.replace(emptyData())}>Apagar tudo</button>
      </section>
    </>
  );
}
