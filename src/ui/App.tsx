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
import { GamesPage } from './pages/GamesPage';
import { WordTetris } from './pages/games/WordTetris';
import { Flashcards } from './pages/games/Flashcards';
import { WordMatch } from './pages/games/WordMatch';
import { DoodleDefs, IconContent, IconGames, IconHome, IconReview, IconWeek } from './components/Doodles';

const NAV = [
  { to: '', label: 'Hoje', Icon: IconHome },
  { to: 'semana', label: 'Semana', Icon: IconWeek },
  { to: 'revisao', label: 'Revisão', Icon: IconReview },
  { to: 'conteudo', label: 'Conteúdo', Icon: IconContent },
  { to: 'jogos', label: 'Jogos', Icon: IconGames },
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
    case 'scan':
      page = (
        <ScanPage
          code={route.query.get('code') ?? undefined}
          autoCam={route.query.get('cam') === '1'}
          autoManual={route.query.get('manual') === '1'}
        />
      );
      break;
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
    case 'jogos': page = rest[0] === 'tetris' ? <WordTetris /> : rest[0] === 'flashcards' ? <Flashcards /> : rest[0] === 'palavras' ? <WordMatch /> : <GamesPage />; break;
    default: page = <Today />;
  }

  const bare = section === 'imprimir' || section === 'aula';

  return (
    <div className={`app ${bare ? 'bare' : ''}`}>
      <DoodleDefs />
      <header className="topbar no-print">
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.to} href={`#/${n.to}`} className={section === n.to ? 'on' : ''}>
              <n.Icon className="nav-icon" width="22" />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className="main">{page}</main>
    </div>
  );
}
