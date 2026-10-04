import { useEffect, useRef } from 'react';
import { abrirRegistro, type Registro } from '../core/progress/registro';
import type { TipoAtividade } from '../core/types';

/**
 * Registro de atividade amarrado à tela: abre ao montar, fecha (e grava) ao sair.
 * `novo()` fecha o atual e abre outro (uma nova partida na mesma tela).
 */
export function useRegistro(tipo: TipoAtividade, origem: string): { atual: () => Registro; novo: () => void } {
  const ref = useRef<Registro | null>(null);
  if (!ref.current) ref.current = abrirRegistro(tipo, origem);
  useEffect(() => () => ref.current?.fechar(), []);
  return {
    atual: () => ref.current!,
    novo: () => { ref.current?.fechar(); ref.current = abrirRegistro(tipo, origem); },
  };
}