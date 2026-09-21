import { useRoute } from './hooks';
import { Today } from './pages/Today';
import { WeekPage } from './pages/WeekPage';
import { SessionPage } from './pages/SessionPage';
import { LessonPage } from './pages/LessonPage';
import { ScanPage } from './pages/ScanPage';
import { PrintPage } from './pages/PrintPage';
import { ReviewPage } from './pages/ReviewPage';
import { LibraryPage } from './pages/LibraryPage';
import { DataPage } from './pages/DataPage';
import { BuilderPage } from './pages/BuilderPage';

const NAV = [
  { to: '', label: 'Hoje', icon: '◐' },
  { to: 'semana', label: 'Semana', icon: '▦' },
  { to: 'scan', label: 'Escanear', icon: '⌗' },
  { to: 'revisao', label: 'Revisão', icon: '↻' },
  { to: 'conteudo', label: 'Conteúdo', icon: '≡' },
];

export function App() {
  const route = useRoute();
  const [head, ...rest] = route.path;
  const section = head ?? '';

  let page;
  switch (section) {
    case 'semana': page = <WeekPage start={rest[0]} />; break;
    case 'sessao': page = <SessionPage id={rest[0]} />; break;
    case 'aula': page = <LessonPage id={rest[0]} />; break;
    case 'scan': page = <ScanPage code={route.query.get('code') ?? undefined} />; break;
    case 'imprimir':
      page = (
        <PrintPage
          key={route.query.toString()}
          ids={route.query.get('ids')?.split(',').filter(Boolean) ?? []}
          mode={(route.query.get('modo') as 'study' | 'week' | 'guide' | null) ?? undefined}
          week={route.query.get('semana') ?? undefined}
        />
      );
      break;
    case 'revisao': page = <ReviewPage />; break;
    case 'conteudo': page = <LibraryPage refId={rest[0]} />; break;
    case 'dados': page = <DataPage />; break;
    case 'montar': page = <BuilderPage week={route.query.get('semana') ?? undefined} />; break;
    default: page = <Today />;
  }

  const bare = section === 'imprimir' || section === 'aula';

  return (
    <div className={`app ${bare ? 'bare' : ''}`}>
      <header className="topbar no-print">
        <a href="#/" className="brand">inglês<span>·</span>híbrido</a>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.to} href={`#/${n.to}`} className={section === n.to ? 'on' : ''}>
              <i aria-hidden>{n.icon}</i>
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className="main">{page}</main>
    </div>
  );
}
