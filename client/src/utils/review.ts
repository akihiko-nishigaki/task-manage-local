// レビュー（レビュー期限・レビュー実施のチェック）まわりの共通処理。
// 判定そのもの（reviewStateOf / watchDueOf / isSettled）は shared/types.ts が正。
import { useCallback } from 'react';
import type { MouseEvent } from 'react';
import type { Task } from '@shared/types';
import { watchDueOf } from '@shared/types';
import { useStore } from '../store';
import { addDays, today } from './date';

/**
 * レビューの切り替え。一覧・カード・ボードの右クリック（onContextMenu）から使う。
 * ブラウザのメニューは出さず、レビュー済み ⇔ レビュー前を切り替える。
 */
export function useToggleReviewed(): (task: Task, e?: MouseEvent) => void {
  const { updateTask, pushToast } = useStore();
  return useCallback(
    (task: Task, e?: MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      const next = !task.reviewed;
      void updateTask(task.id, { reviewed: next }).then(() => {
        pushToast('success', next ? 'レビュー済みにしました' : 'レビュー前に戻しました');
      });
    },
    [updateTask, pushToast],
  );
}

/** 期限・レビュー期限のどちらかが超過しているか（完了・レビュー済みの側は数えない）。 */
export function isWatchOverdue(task: Task): boolean {
  const due = watchDueOf(task);
  return due !== null && due < today();
}

/** 期限・レビュー期限のどちらかが days 日以内か（超過は含まない）。 */
export function isWatchWithinDays(task: Task, days: number): boolean {
  const due = watchDueOf(task);
  if (due === null) return false;
  return due >= today() && due <= addDays(today(), days);
}

