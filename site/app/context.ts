import { createContext as createReactContext } from 'react';
import { createContext } from 'react-router';
import type { Capture } from '../server/errors.ts';
import type { Reads } from '../server/reads.ts';
import type { Values } from './settings';
import type { Directory, Viewer } from './types';

export interface Hub {
  directory: Directory;
  settings: Values;
  reads: Reads;
  viewer: Viewer | null;
  csrf: string | null;
  nonce: string;
  requestId: string;
  capture: Capture;
}

export const hubContext = createContext<Hub>();

export const NonceContext = createReactContext<string | undefined>(undefined);
