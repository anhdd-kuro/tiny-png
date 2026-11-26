import * as stylex from '@stylexjs/stylex';
import { theme } from './theme.stylex';

export const controls = stylex.create({
  button: {
    color: theme.text, backgroundColor: { default: theme.control, ':hover': theme.controlHover, ':active': theme.controlPressed },
    borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 6, paddingBlock: 4, paddingInline: 10,
    fontSize: '.8125rem', lineHeight: '18px', minHeight: 28, flexShrink: 0, fontWeight: 500, justifySelf: 'end',
  },
  icon: {
    color: theme.secondary, borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed },
    borderRadius: 6, width: 28, height: 28, padding: 0, fontSize: 16, display: 'grid', placeItems: 'center',
  },
  field: {
    color: theme.text, backgroundColor: theme.control, borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 5,
    paddingBlock: 4, paddingInline: 8, height: 28, fontSize: '.8125rem', width: 224, maxWidth: '100%',
  },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 224px', alignItems: 'center', gap: 16, fontSize: '.8125rem', lineHeight: '18px', minHeight: 32 },
  section: { marginTop: 24, padding: 16, backgroundColor: theme.surface, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 },
  heading: { margin: 0, fontSize: '.8125rem', fontWeight: 600, lineHeight: 1.4 },
  pathRow: { display: 'flex', alignItems: 'center', gap: 8 },
  path: { fontSize: '.75rem', color: theme.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
});
