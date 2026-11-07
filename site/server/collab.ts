import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { cookies } from './auth.ts';
import type { Bus } from './bus.ts';
import { config } from './config.ts';
import type { Database } from './db.ts';
import { log } from './log.ts';
import type { Posts } from './posts.ts';
import { fillFragment, FRAGMENT } from './render.ts';
import { sameSecret, type Sessions } from './sessions.ts';

export const COLLAB_PATH = '/collab';
const SESSION_COOKIE = 'hub_session';

export interface Collaborator {
  handle: string;
  login: string;
  name: string;
  color: string;
}

export function createCollab(db: Database, posts: Posts, sessions: Sessions, bus: Bus) {
  const member = db.prepare(
    `SELECT m.handle, m.name, p.accent FROM members m LEFT JOIN profiles p USING (handle) WHERE m.login = ? COLLATE NOCASE`,
  );
  const announced = new Map<string, string>();

  function editing(id: string) {
    const document = server.hocuspocus.documents.get(id);
    const seen = new Map<string, Collaborator>();
    for (const state of document?.awareness.getStates().values() ?? []) {
      const user = (state as { user?: Collaborator }).user;
      if (user?.handle) {
        seen.set(user.handle, user);
      }
    }
    return [...seen.values()];
  }

  async function announce(id: string) {
    const editors = editing(id).map(({ handle, name, color }) => ({ handle, name, color }));
    const signature = editors.map((editor) => editor.handle).join(',');
    if ((announced.get(id) ?? '') === signature) {
      return;
    }
    if (signature) {
      announced.set(id, signature);
    } else {
      announced.delete(id);
    }
    await bus.publish({
      topic: 'editing',
      key: id,
      kind: 'editing',
      public: true,
      summary: `${editors.length} editing ${id}`,
      detail: { id, editors },
      at: new Date().toISOString(),
    });
  }

  bus.listen(({ event }) => {
    if (event.topic !== 'sessions') {
      return;
    }
    if (!event.key) {
      server.hocuspocus.closeConnections();
      return;
    }
    for (const document of server.hocuspocus.documents.values()) {
      for (const connection of document.getConnections()) {
        if ((connection.context as Collaborator).login.toLowerCase() === event.key) {
          connection.close();
        }
      }
    }
  });

  const server = new Server<Collaborator>({
    quiet: true,
    debounce: 2_000,
    maxDebounce: 10_000,
    stopOnSignals: false,
    async onAuthenticate({ requestHeaders, documentName, token }) {
      const refuse = (reason: string) => {
        log.warn({ reason, post: documentName }, 'collab refused');
        return new Error(reason);
      };
      if (requestHeaders.get('origin') !== new URL(config.appUrl).origin) {
        throw refuse('wrong origin');
      }
      const session = await sessions.read(
        cookies({ headers: { cookie: requestHeaders.get('cookie') ?? '' } } as IncomingMessage)[
          SESSION_COOKIE
        ],
      );
      if (!session || !sameSecret(token, session.csrf)) {
        throw refuse('not signed in');
      }
      const row = member.get(session.login);
      const post = posts.read(documentName);
      const handle = (row?.handle as string | undefined) ?? null;
      if (
        !post ||
        post.status === 'trashed' ||
        !posts.accessTo(post, { handle, owner: session.owner }).edit
      ) {
        throw refuse('not an editor');
      }
      return {
        handle: handle ?? session.login,
        login: session.login,
        name: (row?.name as string | undefined) ?? session.login,
        color: (row?.accent as string | undefined) ?? '#8b8b95',
      };
    },
    async onLoadDocument({ document, documentName }) {
      const stored = posts.state(documentName);
      if (stored) {
        Y.applyUpdate(document, stored);
      }
      return document;
    },
    async onStoreDocument({ document, documentName, lastContext, clientsCount }) {
      const state = Y.encodeStateAsUpdate(document);
      const by = lastContext?.handle ?? 'collab';
      posts.storeDoc(documentName, state, by);
      if (clientsCount === 0) {
        posts.snapshot(documentName, by, state);
      }
    },
    async beforeHandleAwareness({ context, states }) {
      for (const state of states.values()) {
        if (JSON.stringify(state).length > 4096) {
          throw new Error('Presence is too large');
        }
        if (context) {
          state.user = { name: context.name, color: context.color, handle: context.handle };
        }
      }
    },
    async onAwarenessUpdate({ documentName }) {
      await announce(documentName);
    },
    async onDisconnect({ documentName }) {
      await announce(documentName);
    },
  });

  const upgrades = server as unknown as {
    crossws: { handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void };
  };

  return {
    hocuspocus: server.hocuspocus,
    upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      if (request.url?.split('?')[0] === COLLAB_PATH) {
        upgrades.crossws.handleUpgrade(request, socket, head);
      } else {
        socket.destroy();
      }
    },
    async replace(id: string, content: object) {
      const connection = await server.hocuspocus.openDirectConnection(id, {
        handle: 'restore',
        login: 'restore',
        name: 'restore',
        color: '#8b8b95',
      });
      try {
        await connection.transact((document) =>
          fillFragment(document.getXmlFragment(FRAGMENT), content),
        );
      } finally {
        await connection.disconnect();
      }
    },
    editing,
    destroy() {
      server.hocuspocus.closeConnections();
    },
  };
}

export type Collab = ReturnType<typeof createCollab>;
