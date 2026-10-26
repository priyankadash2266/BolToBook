/**
 * Realtime change feed.
 *
 * Every write publishes a ChangeEvent. Screens subscribe to the topics they show and
 * reload when something changes, whether the change came from this tab, another tab,
 * or (once the backend exists) another device over a WebSocket.
 *
 * Today:  LocalRealtime  — in-tab listeners + BroadcastChannel for other tabs.
 * Later:  WebSocketRealtime — same interface; the server pushes the same events.
 */
export type Topic = 'profile' | 'books' | 'chapters' | 'laps' | 'entities' | 'versions' | 'feedback' | 'audio' | 'media' | 'credits';

export interface ChangeEvent {
  topic: Topic;
  op: 'create' | 'update' | 'delete' | 'reset';
  id?: string;
  bookId?: string;
  /** Who made the change, so a client can ignore its own echoes from the server. */
  origin?: string;
  at: number;
}

export type Listener = (e: ChangeEvent) => void;

export interface Realtime {
  readonly clientId: string;
  publish(e: Omit<ChangeEvent, 'at' | 'origin'>): void;
  subscribe(topics: Topic[] | '*', fn: Listener): () => void;
  /** Connection state, for a future "offline / syncing" indicator. */
  status(): 'local' | 'connecting' | 'open' | 'closed';
}

const clientId = Math.random().toString(36).slice(2, 10);

class LocalRealtime implements Realtime {
  readonly clientId = clientId;
  private listeners = new Set<{ topics: Topic[] | '*'; fn: Listener }>();
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dictationer-changes') : null;

  constructor() {
    this.channel?.addEventListener('message', (m: MessageEvent<ChangeEvent>) => this.emit(m.data));
  }
  publish(e: Omit<ChangeEvent, 'at' | 'origin'>) {
    const ev: ChangeEvent = { ...e, origin: this.clientId, at: Date.now() };
    this.emit(ev);
    this.channel?.postMessage(ev);
  }
  subscribe(topics: Topic[] | '*', fn: Listener) {
    const entry = { topics, fn };
    this.listeners.add(entry);
    return () => { this.listeners.delete(entry); };
  }
  status() { return 'local' as const; }
  private emit(e: ChangeEvent) {
    this.listeners.forEach(({ topics, fn }) => {
      if (topics === '*' || topics.includes(e.topic)) fn(e);
    });
  }
}

/**
 * WebSocket transport, ready for the backend. Expected server messages: ChangeEvent JSON.
 * Client messages: { type: 'subscribe', topics } and { type: 'publish', event }.
 * Reconnects with backoff. Not used until VITE_DATA_SOURCE=http.
 */
export class WebSocketRealtime implements Realtime {
  readonly clientId = clientId;
  private ws: WebSocket | null = null;
  private listeners = new Set<{ topics: Topic[] | '*'; fn: Listener }>();
  private state: 'connecting' | 'open' | 'closed' = 'closed';
  private retry = 0;
  private queue: string[] = [];

  constructor(private url: string, private getToken?: () => string | undefined) { this.connect(); }

  private connect() {
    this.state = 'connecting';
    const token = this.getToken?.();
    this.ws = new WebSocket(token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url);
    this.ws.onopen = () => {
      this.state = 'open'; this.retry = 0;
      this.queue.splice(0).forEach((m) => this.ws?.send(m));
    };
    this.ws.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as ChangeEvent;
        if (e.origin === this.clientId) return;
        this.listeners.forEach(({ topics, fn }) => { if (topics === '*' || topics.includes(e.topic)) fn(e); });
      } catch { /* ignore malformed */ }
    };
    this.ws.onclose = () => {
      this.state = 'closed';
      const delay = Math.min(15000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }
  private send(msg: unknown) {
    const s = JSON.stringify(msg);
    if (this.state === 'open') this.ws?.send(s); else this.queue.push(s);
  }
  publish(e: Omit<ChangeEvent, 'at' | 'origin'>) {
    const ev: ChangeEvent = { ...e, origin: this.clientId, at: Date.now() };
    this.listeners.forEach(({ topics, fn }) => { if (topics === '*' || topics.includes(ev.topic)) fn(ev); });
    this.send({ type: 'publish', event: ev });
  }
  subscribe(topics: Topic[] | '*', fn: Listener) {
    const entry = { topics, fn };
    this.listeners.add(entry);
    this.send({ type: 'subscribe', topics });
    return () => { this.listeners.delete(entry); };
  }
  status() { return this.state; }
}

export const realtime:Realtime=new LocalRealtime();
