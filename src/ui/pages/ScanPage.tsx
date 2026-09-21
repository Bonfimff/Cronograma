import { useEffect, useRef, useState } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import { assignSheet, lookupCode } from '../../core/worksheets/worksheets';
import { PAGES } from '../../core/worksheets/templates';
import { readQR, readSheet, type Img, type SheetReading } from '../../core/scanner/omr';
import { createSession, finishSession, saveUserExercises, startSession, updateSession } from '../../core/sessions/sessions';
import { isBackPayload, isCode, normalizeCode } from '../../core/qrcodes/ids';
import type { MasteryStatus, UnderstoodStatus, UsageStatus } from '../../core/types';
import { SessionForm } from '../components/SessionForm';
import { FinishForm } from '../components/FinishForm';
import { Kind, MASTERY_LABEL, UNDERSTOOD_LABEL, USAGE_LABEL } from '../components/common';
import { fmtShort, weekdayName } from '../../core/dates';

async function fileToImage(file: File, max = 1800): Promise<{ img: Img; url: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return { img: ctx.getImageData(0, 0, w, h), url, w, h };
}

export function ScanPage({ code: initialCode, autoCam, autoManual }: { code?: string; autoCam?: boolean; autoManual?: boolean }) {
  const data = useData();
  const [code, setCode] = useState<string | null>(initialCode ? normalizeCode(initialCode) : null);
  const [reading, setReading] = useState<SheetReading | null>(null);
  const [photo, setPhoto] = useState<{ url: string; w: number; h: number } | null>(null);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(!!autoCam && !initialCode);
  const [correcting, setCorrecting] = useState(false);
  const [manual, setManual] = useState('');
  const manualRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCode(initialCode ? normalizeCode(initialCode) : null);
    setReading(null); setPhoto(null); setCorrecting(false);
  }, [initialCode]);

  useEffect(() => {
    if (autoManual && !initialCode) manualRef.current?.focus();
  }, [autoManual, initialCode]);

  const reset = () => { setCode(null); setReading(null); setPhoto(null); setError(''); setCorrecting(false); go('/scan'); };

  /** Frente (QR) identifica a folha; verso (marcadores) traz as caixas marcadas. */
  const onPhoto = async (f?: File) => {
    if (!f) return;
    setError('');
    const { img, url, w, h } = await fileToImage(f);
    const qr = readQR(img);
    if (qr && !isBackPayload(qr.code)) {
      // frente: só identifica a folha
      setCode(normalizeCode(qr.code));
      setReading(null); setPhoto(null);
      return;
    }
    // verso: o QR "/V" identifica a folha; os marcadores dos cantos localizam as caixas
    const r = readSheet(img, PAGES['study-back']);
    const backQR = qr?.code ?? r?.code;
    const backCode = backQR ? normalizeCode(backQR) : code;
    if (qr && !r) {
      setCode(backCode);
      setError('Reconheci o verso, mas não os 4 marcadores dos cantos. Fotografe a página inteira, com boa luz.');
      return;
    }
    if (!r) {
      setError('Não reconheci a folha. Fotografe a página inteira (os 4 marcadores dos cantos visíveis), com boa luz e sobre uma superfície clara.');
      return;
    }
    if (!backCode) {
      setError('Não encontrei o QR Code desta folha. Fotografe a página inteira, sem cortar o código.');
      return;
    }
    setCode(backCode);
    setReading(r);
    setPhoto({ url, w, h });
  };

  if (!code)
    return (
      <>
        <section className="hero">
          <p className="eyebrow">Escanear</p>
          <h1>Folha → sessão</h1>
          <p className="lead">Fotografe a frente da folha: o QR Code identifica a sessão. No fim do estudo, o verso registra o resultado.</p>
        </section>
        <section className="scan-options">
          <label className="primary big file">
            Fotografar folha
            <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          <button className="ghost" onClick={() => setCamera(!camera)}>{camera ? 'Fechar câmera' : 'Ler só o QR com a câmera'}</button>
          {camera && <LiveQR onCode={(c) => { setCamera(false); setCode(normalizeCode(c)); }} onError={(m) => { setCamera(false); setError(m); }} />}
          <form className="inline-answer" onSubmit={(e) => { e.preventDefault(); if (isCode(manual)) setCode(normalizeCode(manual)); else setError('Código inválido. Formato: ENG-2026-0001'); }}>
            <input ref={manualRef} placeholder="ou digite: ENG-2026-0001" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" />
            <button className="ghost small">Abrir</button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      </>
    );

  const look = lookupCode(data, code);
  const mastery = reading?.groups.find((g) => g.id === 'mastery');
  const usage = reading?.groups.find((g) => g.id === 'usage');
  const understood = reading?.groups.find((g) => g.id === 'understood');

  return (
    <>
      <section className="hero">
        <p className="eyebrow mono">{code}</p>

        {(look.state === 'unknown' || look.state === 'unassigned') && (
          <>
            <h1>Esta folha ainda não possui uma sessão associada.</h1>
            <p className="lead">Escolha semana, dia, tema e conteúdos. A folha passa a representar esta sessão.</p>
          </>
        )}

        {look.state !== 'unknown' && look.state !== 'unassigned' && (
          <>
            <h1>{look.state === 'in_progress' ? 'Finalizar sessão' : look.state === 'done' ? 'Sessão concluída' : 'Sessão encontrada.'}</h1>
            <p className="lead">{look.session.title} · {weekdayName(look.session.date)} {fmtShort(look.session.date)} <Kind k={look.session.kind} /></p>
          </>
        )}
      </section>

      {(look.state === 'unknown' || look.state === 'unassigned') && (
        <section>
          <SessionForm
            submitLabel="Associar folha"
            onCancel={reset}
            onSubmit={(v) => {
              store.update((d) => {
                saveUserExercises(d, v.newExercises ?? []);
                createSession(d, { ...v, code });
                updateSession(d, code, { sheet: v.sheet, app: v.app, expected: v.expected, exerciseIds: v.exerciseIds });
                assignSheet(d, code, code);
              });
            }}
          />
        </section>
      )}

      {look.state === 'ready' && (
        <section className="actions left">
          <button className="primary big" onClick={() => { store.update((d) => startSession(d, look.session.id)); go(`/aula/${look.session.id}`); }}>Iniciar estudo</button>
          <a className="ghost" href={`#/sessao/${look.session.id}`}>Ver sessão</a>
        </section>
      )}

      {(look.state === 'in_progress' || look.state === 'done') && (
        <section>
          {!reading && (
            <div className="scan-options">
              <p>Fotografe o <strong>verso</strong> da folha, com as caixas marcadas e os 4 marcadores dos cantos visíveis.</p>
              <label className="primary big file">
                Fotografar verso
                <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
              {error && <p className="error">{error}</p>}
              <button className="ghost" onClick={() => setCorrecting(true)}>Registrar manualmente</button>
            </div>
          )}

          {reading && photo && (
            <figure className="scan-preview">
              <img src={photo.url} alt="Folha escaneada" />
              <svg viewBox={`0 0 ${photo.w} ${photo.h}`}>
                <polygon points={reading.markers.map((p) => `${p.x},${p.y}`).join(' ')} />
                {reading.groups.flatMap((g) => g.options.map((o) => (
                  <circle key={g.id + o.value} cx={o.center.x} cy={o.center.y} r={photo.w / 90} className={g.selected === o.value ? 'sel' : ''} />
                )))}
              </svg>
            </figure>
          )}

          {reading && !correcting && (
            <div className="result-confirm">
              <p className="big-line">
                Resultado identificado: <strong>{mastery?.selected ? MASTERY_LABEL[mastery.selected] : 'nenhuma caixa marcada'}</strong>
                {understood?.selected && <> · Entendi: <strong>{UNDERSTOOD_LABEL[understood.selected]}</strong></>}
                {usage?.selected && <> · Utilizou: <strong>{USAGE_LABEL[usage.selected]}</strong></>}
              </p>
              {mastery && !mastery.confident && mastery.selected && <p className="warn">Leitura com pouca certeza — confira.</p>}
              <div className="actions left">
                <button className="primary" disabled={!mastery?.selected} onClick={() => {
                  store.update((d) => finishSession(d, look.session.id, {
                    durationMin: look.session.result?.durationMin || Math.max(1, Math.round((Date.now() - new Date(look.session.startedAt ?? Date.now()).getTime()) / 60000)),
                    exercises: look.session.result?.exercises ?? { total: 0, correct: 0 },
                    mastery: mastery!.selected as MasteryStatus,
                    usage: (usage?.selected ?? undefined) as UsageStatus | undefined,
                    understood: (understood?.selected ?? undefined) as UnderstoodStatus | undefined,
                    source: 'scan',
                  }));
                  go(`/sessao/${look.session.id}`);
                }}>Confirmar</button>
                <button className="ghost" onClick={() => setCorrecting(true)}>Corrigir</button>
              </div>
            </div>
          )}

          {correcting && (
            <FinishForm
              session={look.session}
              source={reading ? 'scan' : 'manual'}
              preset={{ mastery: mastery?.selected as MasteryStatus | null, usage: usage?.selected as UsageStatus | null, understood: understood?.selected as UnderstoodStatus | null }}
              onSubmit={(r) => { store.update((d) => finishSession(d, look.session.id, r)); go(`/sessao/${look.session.id}`); }}
            />
          )}
        </section>
      )}

      <section><button className="link" onClick={reset}>Escanear outra folha</button></section>
    </>
  );
}

/** Leitura contínua de QR pela câmera (requer HTTPS ou localhost). */
function LiveQR({ onCode, onError }: { onCode: (c: string) => void; onError: (m: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const r = readQR(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (r) return onCode(r.code);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        onError('Câmera indisponível. Use "Fotografar folha" (a câmera ao vivo exige HTTPS).');
      }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <video ref={video} className="live" playsInline muted />;
}
