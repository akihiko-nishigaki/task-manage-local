// 「現在のユーザー」で絞り込んでいることを画面から分かるようにする案内。
import { useStore } from '../store';

export function UserScopeHint() {
  const { currentUser, unassignedOnly } = useStore();
  const who = unassignedOnly
    ? '未割当のタスク'
    : currentUser
      ? `${currentUser.name} さんの担当タスク`
      : null;
  if (!who) return null;
  return <p className="muted head-hint">{who}のみ表示中（左サイドバーの「現在のユーザー」で切り替え）</p>;
}
