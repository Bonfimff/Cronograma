// Tipos mínimos do conversor de fonemas (módulo Emscripten).
export function createPiperPhonemize(opts: {
  print: (linha: string) => void;
  printErr: (linha: string) => void;
  locateFile: (arquivo: string) => string;
}): Promise<{ callMain: (args: string[]) => void }>;
