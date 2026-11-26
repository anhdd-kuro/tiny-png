type IconName = 'photo' | 'folder' | 'retry' | 'close' | 'settings' | 'automation' | 'general' | 'cloud' | 'check';
const paths: Record<IconName, string> = {
  photo: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',
  folder: 'M3 7V5h6l2 2h10v12H3z',
  retry: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'm10 3-1 3-3 1-2 3 2 3 1 3 3 2 3-2 3-1 2-3-2-3-1-3-3-1ZM14 10.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  automation: 'm13 2-8 12h6l-1 8 9-13h-7z',
  general: 'M5 6h14M5 12h14M5 18h14M9 3v6M15 9v6M10 15v6',
  cloud: 'M7 18a5 5 0 0 1-1-9 6 6 0 0 1 11-2 5 5 0 0 1 1 11Z',
  check: 'm5 12 4 4L19 6',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
