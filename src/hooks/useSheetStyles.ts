import { ViewStyle } from 'react-native';
import { useResponsive } from './useResponsive';
import { DialogWidth } from '../constants/layout';

export type SheetSize = 'sm' | 'md' | 'lg';

/**
 * Responsive positioning for bottom-sheet style modals.
 *
 * Phone   → sheet pinned to the bottom, full width, rounded top corners.
 * Desktop → centered dialog, capped width, rounded all corners.
 *
 * Retrofit an existing modal by spreading these into its overlay + sheet styles:
 *
 *   const sheet = useSheetStyles('md');
 *   <Pressable style={[styles.overlay, sheet.overlay]} onPress={close}>
 *     <Pressable style={[styles.sheet, sheet.sheet]} onPress={() => {}}>
 *
 * The base styles.overlay/sheet should NOT set justifyContent / width / border
 * radius that conflict — let these win (put them last in the array).
 */
export function useSheetStyles(size: SheetSize = 'md'): { overlay: ViewStyle; sheet: ViewStyle } {
  const { isDesktop } = useResponsive();

  if (isDesktop) {
    return {
      overlay: { justifyContent: 'center', alignItems: 'center', padding: 24 },
      sheet: {
        width: '100%',
        maxWidth: DialogWidth[size],
        borderRadius: 24,
        // undo the bottom-sheet-only top rounding
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
      },
    };
  }

  // Phone / tablet: keep the bottom-sheet look.
  return {
    overlay: { justifyContent: 'flex-end' },
    sheet: { width: '100%' },
  };
}
