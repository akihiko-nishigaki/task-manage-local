// 依存ライブラリを増やさないための最小ハッシュルーター。
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'all' }
  | { name: 'mine' }
  | { name: 'project'; projectId: number }
  | { name: 'members' }
  | { name: 'tags' }
  | { name: 'archive' }
  | { name: 'settings' };

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/';
    case 'project':
      return `#/project/${route.projectId}`;
    default:
      return `#/${route.name}`;
  }
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\//, '');
  const parts = path.split('/').filter(Boolean);
  const head = parts[0];
  if (!head) return { name: 'dashboard' };
  if (head === 'project') {
    const id = Number(parts[1]);
    if (Number.isFinite(id) && id > 0) return { name: 'project', projectId: id };
    return { name: 'all' };
  }
  if (
    head === 'all' ||
    head === 'mine' ||
    head === 'members' ||
    head === 'tags' ||
    head === 'archive' ||
    head === 'settings'
  ) {
    return { name: head };
  }
  return { name: 'dashboard' };
}

export function navigate(route: Route): void {
  const next = routeToHash(route);
  if (window.location.hash !== next) window.location.hash = next;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeToHash(a) === routeToHash(b);
}
