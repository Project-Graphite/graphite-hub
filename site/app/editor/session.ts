import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { LocalDraft } from './local-draft';

export interface Session {
  document: Y.Doc;
  draft: LocalDraft;
  provider: HocuspocusProvider;
}

interface Held {
  session: Session;
  users: number;
  closing?: ReturnType<typeof setTimeout>;
}

const held = new Map<string, Held>();
const LINGER_MS = 1000;

export function sessionKey(id: string, login: string) {
  return `hub-post-${id}-${login}`;
}

export function openSession(id: string, login: string, token: string): Session {
  const key = sessionKey(id, login);
  let entry = held.get(key);
  if (!entry) {
    const document = new Y.Doc();
    entry = {
      session: {
        document,
        draft: new LocalDraft(key, document),
        provider: new HocuspocusProvider({
          url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`,
          name: id,
          document,
          token,
        }),
      },
      users: 0,
    };
    held.set(key, entry);
  }
  return entry.session;
}

export function holdSession(id: string, login: string) {
  const key = sessionKey(id, login);
  const entry = held.get(key);
  if (!entry) {
    return () => {};
  }
  clearTimeout(entry.closing);
  entry.users += 1;
  return () => {
    entry.users -= 1;
    if (entry.users <= 0) {
      entry.closing = setTimeout(() => {
        if (entry.users <= 0 && held.get(key) === entry) {
          held.delete(key);
          entry.session.provider.destroy();
          entry.session.draft.destroy();
          entry.session.document.destroy();
        }
      }, LINGER_MS);
    }
  };
}
