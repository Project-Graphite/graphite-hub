import { createContext as createReactContext } from 'react';
import { createContext } from 'react-router';
import type { Admin } from '../server/admin.ts';
import type { Collab } from '../server/collab.ts';
import type { Capture } from '../server/errors.ts';
import type { Messages } from '../server/messages.ts';
import type { Posts } from '../server/posts.ts';
import type { Presence } from '../server/presence.ts';
import type { Presentations } from '../server/presentation.ts';
import type { Profiles } from '../server/profiles.ts';
import type { Writeback } from '../server/writeback.ts';
import type { Uploads } from '../server/uploads.ts';
import type { Share } from '../server/share.ts';
import type { Reads } from '../server/reads.ts';
import type { Subscribers } from '../server/subscribers.ts';
import type { Views } from '../server/views.ts';
import type { Values } from './settings';
import type { Directory, Viewer } from './types';

export interface Hub {
  directory: Directory;
  settings: Values;
  reads: Reads;
  admin: Admin;
  messages: Messages;
  share: Share;
  profiles: Profiles;
  presentations: Presentations;
  writeback: Writeback;
  uploads: Uploads;
  posts: Posts;
  subscribers: Subscribers;
  collab: Collab;
  presence: Presence;
  views: Views;
  address: string;
  origin: string;
  viewer: Viewer | null;
  csrf: string | null;
  nonce: string;
  requestId: string;
  capture: Capture;
}

export const hubContext = createContext<Hub>();

export const NonceContext = createReactContext<string | undefined>(undefined);
