import { useEffect, useState, useSyncExternalStore } from 'react';
import { store } from '../core/storage/store';

export function useData() {
  return useSyncExternalStore((cb) => store.subscribe(cb), () => store.get());
}

export interface Route { path: string[]; query: URLSearchParams }

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (to: string) => {
  location.hash = to.startsWith('#') ? to : `#${to}`;
};
