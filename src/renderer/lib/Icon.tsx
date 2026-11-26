type IconName = 'photo' | 'folder' | 'retry' | 'close' | 'settings' | 'automation' | 'general' | 'cloud' | 'check' | 'plus' | 'warning';
const paths: Record<IconName, string> = {
  photo: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',
  folder: 'M3 7V5h6l2 2h10v12H3z',
  retry: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M12.00 4.00L13.95 2.19L15.83 2.76L16.44 5.35L17.66 6.34L20.31 6.44L21.24 8.17L19.85 10.44L20.00 12.00L21.81 13.95L21.24 15.83L18.65 16.44L17.66 17.66L17.56 20.31L15.83 21.24L13.56 19.85L12.00 20.00L10.05 21.81L8.17 21.24L7.56 18.65L6.34 17.66L3.69 17.56L2.76 15.83L4.15 13.56L4.00 12.00L2.19 10.05L2.76 8.17L5.35 7.56L6.34 6.34L6.44 3.69L8.17 2.76L10.44 4.15ZM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
  automation: 'm13 2-8 12h6l-1 8 9-13h-7z',
  general: 'M5 6h14M5 12h14M5 18h14M9 3v6M15 9v6M10 15v6',
  cloud: 'M7 18a5 5 0 0 1-1-9 6 6 0 0 1 11-2 5 5 0 0 1 1 11Z',
  plus: 'M12 5v14M5 12h14',
  warning: 'M12 3 2 21h20L12 3ZM12 9v5M12 17h.01',
  check: 'm5 12 4 4L19 6',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
