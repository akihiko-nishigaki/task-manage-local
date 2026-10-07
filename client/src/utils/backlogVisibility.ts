import { useCallback, useState } from 'react';
import type { TaskStatus } from '@shared/types';
import { TASK_STATUSES } from '@shared/types';

const KEY = 'taskmanage.showBacklog';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * プロダクトバックログ列を表示するかどうか。常用しない人が多いので既定は非表示。
 * 設定はブラウザごと（= 利用者ごと）に保存し、共有サーバーの他の人には影響しない。
 */
export function useShowBacklog(): [boolean, (next: boolean) => void] {
  const [show, setShow] = useState<boolean>(load);
  const set = useCallback((next: boolean) => {
    setShow(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* localStorage が使えない環境では、この画面を開いている間だけ有効 */
    }
  }, []);
  return [show, set];
}

export function visibleStatuses(showBacklog: boolean): TaskStatus[] {
  return showBacklog ? TASK_STATUSES : TASK_STATUSES.filter((s) => s !== 'backlog');
}
