import { useData } from '../hooks';
import { store, emptyData } from '../../core/storage/store';
import type { UserData } from '../../core/types';

/** Backup: os dados do usuário ficam no navegador; exporte para não perder. */
export function DataPage() {
  const data = useData();
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ingles-hibrido-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as UserData;
      if (d.version !== 1 || !Array.isArray(d.sessions)) throw new Error();
      if (confirm('Substituir os dados atuais pelos do arquivo?')) store.replace(d);
    } catch {
      alert('Arquivo inválido.');
    }
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Dados</p>
        <h1>Backup</h1>
        <p className="lead">{data.sessions.length} sessões · {data.worksheets.length} folhas · {data.history.length} registros no histórico. Tudo fica salvo neste navegador.</p>
      </section>
      <section className="actions left">
        <button className="primary" onClick={exportJson}>Exportar JSON</button>
        <label className="ghost file">Importar JSON<input type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} /></label>
        <button className="link" onClick={() => confirm('Apagar todos os dados locais?') && store.replace(emptyData())}>Apagar tudo</button>
      </section>
    </>
  );
}
