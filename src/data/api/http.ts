import type { Api } from './types';
import { realtime, type Topic } from '../realtime';
import { track } from '@/lib/analytics';

/**
 * HTTP data source for the real backend. Each method maps 1:1 to a REST endpoint,
 * so the backend only needs to implement the routes listed here. Realtime updates
 * arrive over the WebSocket (see data/realtime) and refresh screens automatically.
 *
 *   GET    /me                          PATCH /me
 *   GET    /books                       POST  /books
 *   GET    /books/:id                   PATCH /books/:id      DELETE /books/:id
 *   GET    /books/:id/chapters          POST  /books/:id/chapters
 *   PUT    /books/:id/chapters/order
 *   GET    /billing/prices  GET /billing/balance  GET /billing/ledger  POST /billing/charge (402 when short)  POST /billing/topup
 *   GET    /books/:id/draft             (free-writing manuscript; create on first GET)
 *   GET    /chapters/:id                PATCH /chapters/:id   DELETE /chapters/:id
 *   GET    /laps?bookId&status&chapterId  POST /laps
 *   PATCH  /laps/:id                    DELETE /laps/:id
 *   GET    /books/:id/entities?kind     POST  /entities
 *   PATCH  /entities/:id                DELETE /entities/:id
 *   GET    /books/:id/versions?chapterId  POST /versions/:id/restore
 *   GET    /books/:id/feedback          POST  /feedback
 *   PATCH  /feedback/:id                DELETE /feedback/:id
 *   POST   /audio (multipart)           GET   /audio/:id      DELETE /audio/:id
 *   GET    /audio/stats                 DELETE /audio
 *   POST   /media (multipart)           GET   /media/:id  GET /books/:id/media  DELETE /media/:id
 *   GET    /export                      POST  /import         DELETE /me/data
 */
export class HttpApi implements Api {
  constructor(private base: string, private getToken: () => string | undefined = () => undefined) {}

  private async req<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
    const headers: Record<string, string> = { 'X-Client-Id': realtime.clientId };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.base + path, { method, headers, body: payload, credentials: 'include' });
    if (!res.ok) throw new Error(res.status===402?'insufficient-credits':`${method} ${path} failed: ${res.status}`);
    if(method!=='GET'){
      const topics:Topic[]=['profile','books','chapters','laps','entities','versions','feedback','audio','media','credits'];
      topics.forEach(topic=>realtime.publish({topic,op:'reset'}));
      if(method==='POST'&&path==='/laps')void track('idea_saved');
      if(method==='POST'&&path==='/books')void track('book_created');
    }
    if (raw) return (await res.blob()) as T;
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
  private qs(o: Record<string, string | undefined>) {
    const p = Object.entries(o).filter(([, v]) => v);
    return p.length ? '?' + new URLSearchParams(p as [string, string][]).toString() : '';
  }

  profile: Api['profile'] = {
    get: () => this.req('GET', '/me'),
    update: (patch) => this.req('PATCH', '/me', patch),
  };
  books: Api['books'] = {
    list: () => this.req('GET', '/books'),
    get: (id) => this.req('GET', `/books/${id}`),
    create: (input) => this.req('POST', '/books', input),
    update: (id, patch) => this.req('PATCH', `/books/${id}`, patch),
    remove: (id) => this.req('DELETE', `/books/${id}`),
  };
  chapters: Api['chapters'] = {
    list: (bookId) => this.req('GET', `/books/${bookId}/chapters`),
    get: (id) => this.req('GET', `/chapters/${id}`),
    create: (bookId, input) => this.req('POST', `/books/${bookId}/chapters`, input ?? {}),
    update: (id, patch, version) => this.req('PATCH', `/chapters/${id}`, { ...patch, version }),
    remove: (id) => this.req('DELETE', `/chapters/${id}`),
    reorder: (bookId, orderedIds) => this.req('PUT', `/books/${bookId}/chapters/order`, { orderedIds }),
    draft: (bookId) => this.req('GET', `/books/${bookId}/draft`),
  };
  laps: Api['laps'] = {
    list: (f = {}) => this.req('GET', `/laps${this.qs(f)}`),
    create: (input) => this.req('POST', '/laps', input),
    update: (id, patch) => this.req('PATCH', `/laps/${id}`, patch),
    remove: (id) => this.req('DELETE', `/laps/${id}`),
  };
  entities: Api['entities'] = {
    list: (bookId, kind) => this.req('GET', `/books/${bookId}/entities${this.qs({ kind })}`),
    create: (input) => this.req('POST', '/entities', input),
    update: (id, patch) => this.req('PATCH', `/entities/${id}`, patch),
    remove: (id) => this.req('DELETE', `/entities/${id}`),
  };
  versions: Api['versions'] = {
    list: (bookId, chapterId) => this.req('GET', `/books/${bookId}/versions${this.qs({ chapterId })}`),
    restore: (versionId, which) => this.req('POST', `/versions/${versionId}/restore`, { which }),
  };
  feedback: Api['feedback'] = {
    list: (bookId) => this.req('GET', `/books/${bookId}/feedback`),
    create: (input) => this.req('POST', '/feedback', input),
    update: (id, patch) => this.req('PATCH', `/feedback/${id}`, patch),
    remove: (id) => this.req('DELETE', `/feedback/${id}`),
  };
  audio: Api['audio'] = {
    put: async (blob, durationMs) => {
      const fd = new FormData();
      fd.append('file', blob);
      if (durationMs) fd.append('durationMs', String(durationMs));
      return (await this.req<{ id: string }>('POST', '/audio', fd)).id;
    },
    get: (id) => this.req('GET', `/audio/${id}`, undefined, true),
    remove: (id) => this.req('DELETE', `/audio/${id}`),
    stats: () => this.req('GET', '/audio/stats'),
    clearAll: () => this.req('DELETE', '/audio'),
  };
  media: Api['media'] = {
    put: async (file, meta) => {
      const fd = new FormData();
      fd.append('file', file); fd.append('name', meta.name);
      if (meta.bookId) fd.append('bookId', meta.bookId);
      return (await this.req<{ id: string }>('POST', '/media', fd)).id;
    },
    get: async (id) => {
      const meta = await this.req<Omit<import('../types').MediaItem, 'blob'>>('GET', `/media/${id}/meta`);
      const blob = await this.req<Blob>('GET', `/media/${id}`, undefined, true);
      return { ...meta, blob };
    },
    list: (bookId) => this.req('GET', `/books/${bookId}/media`),
    remove: (id) => this.req('DELETE', `/media/${id}`),
  };
  billing: Api['billing'] = {
    prices: () => this.req('GET', '/billing/prices'),
    balance: async () => (await this.req<{ balance: number }>('GET', '/billing/balance')).balance,
    ledger: (limit) => this.req('GET', `/billing/ledger${limit ? `?limit=${limit}` : ''}`),
    charge: (input) => this.req('POST', '/billing/charge', input),
    topUp: (amount, note) => this.req('POST', '/billing/topup', { amount, note }),
  };

  data: Api['data'] = {
    exportAll: () => this.req('GET', '/export'),
    importAll: (dump) => this.req('POST', '/import', dump),
    wipe: () => this.req('DELETE', '/me/data'),
  };
}
