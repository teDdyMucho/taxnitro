import { useWindowDimensions } from 'react-native';
import { Breakpoints } from '../constants/layout';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

export interface Responsive {
  width: number;
  height: number;
  device: DeviceClass;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;   // ≥ desktop breakpoint (sidebar layout)
  isWide: boolean;      // ≥ wide breakpoint
  /** Pick a value by device class, falling back to the phone value. */
  select: <T,>(opts: { phone: T; tablet?: T; desktop?: T }) => T;
}

/**
 * Live responsive info. Uses useWindowDimensions so it re-renders on resize
 * (unlike a module-load Dimensions.get snapshot).
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= Breakpoints.desktop;
  const isTablet  = !isDesktop && width >= Breakpoints.tablet;
  const isPhone   = width < Breakpoints.tablet;
  const isWide    = width >= Breakpoints.wide;
  const device: DeviceClass = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'phone';

  const select = <T,>(opts: { phone: T; tablet?: T; desktop?: T }): T => {
    if (isDesktop && opts.desktop !== undefined) return opts.desktop;
    if ((isTablet || isDesktop) && opts.tablet !== undefined) return opts.tablet;
    return opts.phone;
  };

  return { width, height, device, isPhone, isTablet, isDesktop, isWide, select };
}
