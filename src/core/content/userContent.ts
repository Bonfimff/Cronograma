import type { Store } from '../storage/store';
import { setUserContent } from './repository';

/** Mantém o repositório de conteúdo sincronizado com o conteúdo salvo pelo usuário. */
export function bindUserContent(store: Store): void {
  let last = store.get().content;
  setUserContent(last);
  store.subscribe((d) => {
    if (d.content !== last) {
      last = d.content;
      setUserContent(last);
    }
  });
}
