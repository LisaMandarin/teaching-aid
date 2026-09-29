// Line icons for buttons, drawn in the button's text color.
function Icon({ children, strokeWidth = 2 }: { children: React.ReactNode; strokeWidth?: number }) {
  return (
    <svg
      className="icon"
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const SoundOnIcon = () => (
  <Icon>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a10 10 0 0 1 0 14" />
  </Icon>
);

export const SoundOffIcon = () => (
  <Icon>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="m16 9 6 6" />
    <path d="m22 9-6 6" />
  </Icon>
);

export const FolderIcon = () => (
  <Icon>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon strokeWidth={2.2}>
    <path d="M12 4v12" />
    <path d="m6 10 6 6 6-6" />
    <path d="M4 20h16" />
  </Icon>
);
