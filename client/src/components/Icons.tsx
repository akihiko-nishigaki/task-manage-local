// インライン SVG アイコン。外部アイコンフォント・画像は使用しない。
import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: Props) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconSearch = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Base>
);

export const IconClose = (p: Props) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const IconList = (p: Props) => (
  <Base {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Base>
);

export const IconBoard = (p: Props) => (
  <Base {...p}>
    <rect x="3" y="4" width="6" height="16" rx="1.5" />
    <rect x="11" y="4" width="6" height="10" rx="1.5" />
    <rect x="19" y="4" width="2" height="14" rx="1" />
  </Base>
);

export const IconHome = (p: Props) => (
  <Base {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Base>
);

export const IconInbox = (p: Props) => (
  <Base {...p}>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z" />
  </Base>
);

export const IconUser = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
  </Base>
);

export const IconUsers = (p: Props) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
    <path d="M16 5.2A3.2 3.2 0 0 1 16 14M21 19c0-2.4-1.5-4-4-4.6" />
  </Base>
);

export const IconTag = (p: Props) => (
  <Base {...p}>
    <path d="M12.6 3H20a1 1 0 0 1 1 1v7.4a1 1 0 0 1-.3.7l-8.6 8.6a1 1 0 0 1-1.4 0l-7.4-7.4a1 1 0 0 1 0-1.4l8.6-8.6a1 1 0 0 1 .7-.3z" />
    <circle cx="16.5" cy="7.5" r="1.4" />
  </Base>
);

export const IconSettings = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.7.7v.2a2 2 0 1 1-4 0v-.1a1 1 0 0 0-1.8-.6l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0-.6-1.8H5a2 2 0 1 1 0-4h.1a1 1 0 0 0 .7-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.7-.6V5a2 2 0 1 1 4 0v.1a1 1 0 0 0 1.8.6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0 .6 1.8H19a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6z" />
  </Base>
);

export const IconTrash = (p: Props) => (
  <Base {...p}>
    <path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
  </Base>
);

export const IconEdit = (p: Props) => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
  </Base>
);

export const IconArchive = (p: Props) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </Base>
);

export const IconChevron = (p: Props) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const IconAlert = (p: Props) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </Base>
);

export const IconCalendar = (p: Props) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
);

export const IconProgress = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v5l3.2 2" />
  </Base>
);

export const IconDownload = (p: Props) => (
  <Base {...p}>
    <path d="M12 4v11M8 11l4 4 4-4M4 19h16" />
  </Base>
);

export const IconUpload = (p: Props) => (
  <Base {...p}>
    <path d="M12 19V8M8 12l4-4 4 4M4 19h16" />
  </Base>
);

export const IconLock = (p: Props) => (
  <Base {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Base>
);
