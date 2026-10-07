interface Props {
  show: boolean;
  onChange: (next: boolean) => void;
  /** バックログに入っているタスク数（非表示でも件数は見えるようにする） */
  count: number;
}

/** プロダクトバックログ列の表示 / 非表示ボタン。 */
export function BacklogToggle({ show, onChange, count }: Props) {
  return (
    <button
      type="button"
      className={`btn btn-sm backlog-toggle${show ? ' is-on' : ''}`}
      aria-pressed={show}
      onClick={() => onChange(!show)}
      title={show ? 'バックログの列を隠します' : 'バックログの列を表示します'}
    >
      <span className="col-dot col-backlog" aria-hidden="true" />
      バックログ{show ? 'を隠す' : 'を表示'}
      <span className="backlog-toggle-count">{count}</span>
    </button>
  );
}
