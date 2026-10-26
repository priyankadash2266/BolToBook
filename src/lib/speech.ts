/**
 * Dictation engine.
 *
 * DictationEngine is the interface the UI uses. Today it is backed by the browser's
 * Web Speech API (Chrome, Edge, Safari). When the backend exists, a StreamingEngine
 * can send audio over the WebSocket and emit the same events — no UI changes.
 */
import { useEffect, useRef, useState } from 'react';

export type DictationState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';
export type DictationError = 'unsupported' | 'not-allowed' | 'no-speech' | 'network' | 'audio-capture' | 'aborted' | 'unknown';

export interface DictationEvents {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onState?: (s: DictationState) => void;
  onError?: (e: DictationError) => void;
}

export interface DictationEngine {
  readonly supported: boolean;
  start(locale: string, events: DictationEvents): void;
  stop(): void;
  abort(): void;
}

/* Minimal typings for the Web Speech API */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SR {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SR;

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

class WebSpeechEngine implements DictationEngine {
  readonly supported = !!getCtor();
  private rec: SR | null = null;
  private wanted = false;
  private events: DictationEvents = {};

  start(locale: string, events: DictationEvents) {
    const Ctor = getCtor();
    this.events = events;
    if (!Ctor) { events.onError?.('unsupported'); events.onState?.('error'); return; }
    this.abort();
    this.wanted = true;
    const rec = new Ctor();
    rec.lang = locale;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.events.onState?.('listening');
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.events.onFinal?.(r[0].transcript);
        else interim += r[0].transcript;
      }
      this.events.onInterim?.(interim);
    };
    rec.onerror = (e) => {
      const map: Record<string, DictationError> = { 'not-allowed': 'not-allowed', 'service-not-allowed': 'not-allowed', 'no-speech': 'no-speech', network: 'network', 'audio-capture': 'audio-capture', aborted: 'aborted' };
      const err = map[e.error] ?? 'unknown';
      if (err === 'no-speech' || err === 'aborted') return; // keep listening quietly
      this.wanted = false;
      this.events.onError?.(err);
      this.events.onState?.('error');
    };
    rec.onend = () => {
      // Browsers stop after a pause; keep going until the author presses stop.
      if (this.wanted) { try { rec.start(); return; } catch { /* fallthrough */ } }
      this.events.onInterim?.('');
      this.events.onState?.('idle');
    };
    this.rec = rec;
    this.events.onState?.('starting');
    try { rec.start(); } catch { this.events.onError?.('unknown'); }
  }
  stop() { this.wanted = false; this.events.onState?.('stopping'); try { this.rec?.stop(); } catch { /* */ } }
  abort() { this.wanted = false; try { this.rec?.abort(); } catch { /* */ } this.rec = null; }
}

export const createDictationEngine = (): DictationEngine => new WebSpeechEngine();
export const speechSupported = () => !!getCtor();

/** Live microphone level (0–1), so the waveform moves with the author's actual voice. */
export function useMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) { setLevel(0); return; }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      let smooth = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        smooth = smooth * 0.75 + Math.min(1, rms * 5) * 0.25;
        setLevel(smooth);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => setLevel(0));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      setLevel(0);
    };
  }, [active]);
  return level;
}

/** Records audio for Laps (kept or discarded per the author's retention setting). */
export class LapRecorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private started = 0;
  private stream: MediaStream | null = null;
  async start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mr = new MediaRecorder(this.stream);
      this.chunks = [];
      this.mr.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.mr.start();
      this.started = Date.now();
      return true;
    } catch { return false; }
  }
  stop(): Promise<{ blob: Blob; durationMs: number } | null> {
    return new Promise((resolve) => {
      if (!this.mr || this.mr.state === 'inactive') { this.cleanup(); resolve(null); return; }
      this.mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mr?.mimeType || 'audio/webm' });
        const durationMs = Date.now() - this.started;
        this.cleanup();
        resolve(blob.size ? { blob, durationMs } : null);
      };
      this.mr.stop();
    });
  }
  cancel() { try { this.mr?.stop(); } catch { /* */ } this.cleanup(); }
  private cleanup() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
}
