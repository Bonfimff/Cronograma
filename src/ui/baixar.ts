import { simplificar } from '../core/content/search';
import type { Session, UserData } from '../core/types';
import { pacoteDoRascunho, pacoteParaCompartilhar, rascunhoDaSessao } from '../core/planning/rascunhoAula';
import type { WeekPackage } from '../core/planning/weekPackage';

/** Salva um JSON no aparelho. */
export function baixarJson(nome: string, dados: unknown): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
  a.download = nome;
  a.click();
}

const nomeDoArquivo = (titulo: string) => `aula-${simplificar(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sem-titulo'}.json`;

/** A aula num arquivo que outro aluno (ou professor) importa como pacote semanal. */
export function baixarPacoteDaAula(pkg: WeekPackage, dados: UserData): void {
  const titulo = pkg.days[0]?.sessions?.[0]?.title ?? '';
  baixarJson(nomeDoArquivo(titulo), pacoteParaCompartilhar(pkg, dados));
}

export function baixarAula(s: Session, dados: UserData): void {
  baixarPacoteDaAula(pacoteDoRascunho(rascunhoDaSessao(s, dados), dados), dados);
}
