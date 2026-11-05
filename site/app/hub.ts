import { useMemo } from 'react';
import { data, useRouteLoaderData, type RouterContextProvider } from 'react-router';
import { hubContext } from './context';
import { createModel } from './model';
import type { loader } from './root';

export function useRoot() {
  return useRouteLoaderData<typeof loader>('root');
}

export function useHub() {
  const directory = useRoot()!.directory;
  return useMemo(() => createModel(directory), [directory]);
}

export function modelFrom(context: Readonly<RouterContextProvider>) {
  return createModel(context.get(hubContext).directory);
}

export function found<T>(value: T | undefined): T {
  if (value === undefined) {
    throw data(null, { status: 404 });
  }
  return value;
}
