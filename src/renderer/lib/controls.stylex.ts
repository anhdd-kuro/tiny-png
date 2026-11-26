import * as stylex from '@stylexjs/stylex';
import { theme } from './theme.stylex';

export const controls = stylex.create({
  button: {
    color: theme.text, backgroundColor: { default: theme.control, ':hover': theme.controlHover, ':active': theme.controlPressed },
    borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 6, paddingBlock: 5, paddingInline: 11,
    fontSize: '.8125rem', lineHeight: 1.4, minHeight: 30, flexShrink: 0, fontWeight: 500,
  },
  icon: {
    color: theme.secondary, borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', backgroundColor: { default: 'transparent', ':hover': theme.controlHover, ':active': theme.controlPressed },
    borderRadius: 6, width: 30, height: 30, padding: 0, fontSize: 19, display: 'grid', placeItems: 'center',
  },
  field: {
    color: theme.text, backgroundColor: theme.control, borderWidth: 1, borderStyle: 'solid', borderColor: theme.border, borderRadius: 5,
    paddingBlock: 5, paddingInline: 8, minHeight: 30, fontSize: '.8125rem', maxWidth: 240,
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, fontSize: '.8125rem', lineHeight: 1.5, minHeight: 32 },
  section: { paddingBlock: 19, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: theme.separator, display: 'flex', flexDirection: 'column', gap: 13 },
  heading: { margin: 0, fontSize: '.8125rem', fontWeight: 600, lineHeight: 1.4 },
  pathRow: { display: 'flex', alignItems: 'center', gap: 9 },
  path: { fontSize: '.75rem', color: theme.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
});
