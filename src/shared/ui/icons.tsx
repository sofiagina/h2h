import type { ReactNode, SVGProps } from 'react';

/**
 * Собственный набор иконок Hand2Hand: сетка 24×24, обводка 1.8, скруглённые концы.
 * Цвет — currentColor, размер — через проп size.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(name: string, body: ReactNode, filled = false) {
  const Icon = ({ size = 20, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {body}
    </svg>
  );
  Icon.displayName = `Icon${name}`;
  return Icon;
}

// Интерфейс
export const IconSearch = make('Search', <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>);
export const IconStar = make('Star', <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" />);
export const IconStarFilled = make('StarFilled', <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" />, true);
export const IconCalendar = make('Calendar', <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
export const IconTicket = make(
  'Ticket',
  <><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z" /><path d="M14.5 7v1.5M14.5 11.25v1.5M14.5 15.5V17" /></>,
);
export const IconPin = make('Pin', <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>);
export const IconChevronLeft = make('ChevronLeft', <path d="M14.5 5.5 8 12l6.5 6.5" />);
export const IconChevronRight = make('ChevronRight', <path d="M9.5 5.5 16 12l-6.5 6.5" />);
export const IconArrowRight = make('ArrowRight', <path d="M5 12h14M13 6l6 6-6 6" />);
export const IconHelp = make('Help', <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" /><path d="M12 17h.01" /></>);
export const IconUser = make('User', <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>);
export const IconClose = make('Close', <path d="M6 6l12 12M18 6 6 18" />);
export const IconSun = make('Sun', <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const IconMoon = make('Moon', <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />);
export const IconShield = make('Shield', <><path d="M12 3.5 5 6v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>);
export const IconSwap = make('Swap', <><path d="M5 8.5h13.5M15 5l3.5 3.5L15 12" /><path d="M19 15.5H5.5M9 12l-3.5 3.5L9 19" /></>);
export const IconWallet = make('Wallet', <><rect x="3.5" y="6" width="17" height="13" rx="3" /><path d="M3.5 10h17M16 14.5h1.5" /></>);
export const IconChat = make('Chat', <path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6a2.5 2.5 0 0 1-2.5 2.5H9Z" />);
export const IconBell = make('Bell', <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5Z" /><path d="M10 20.5h4" /></>);
export const IconSparkle = make('Sparkle', <path d="M12 3.5c.6 4 2.5 5.9 6.5 6.5-4 .6-5.9 2.5-6.5 6.5-.6-4-2.5-5.9-6.5-6.5 4-.6 5.9-2.5 6.5-6.5ZM18.5 15.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z" />);

// Категории
export const IconMusic = make('Music', <><path d="M9 17.5V6.5l10-2v11" /><circle cx="6.8" cy="17.5" r="2.2" /><circle cx="16.8" cy="15.5" r="2.2" /></>);
export const IconTent = make('Tent', <><path d="M3 20 12 5.5 21 20Z" /><path d="M9.5 20 12 15l2.5 5" /><path d="M12 5.5V3l3 1-3 1" /></>);
export const IconMasks = make(
  'Masks',
  <><path d="M3.5 5.5c2.8 1 5.7 1 8.5 0v5.2a4.25 4.25 0 0 1-8.5 0Z" /><path d="M6 9h.01M9.5 9h.01M6.2 12.2c.9.7 2.2.7 3.1 0" /><path d="M14 9.2c2.2.6 4.4.5 6.5-.2v5.2a4.25 4.25 0 0 1-7.6 2.6" /><path d="M16 13h.01M18.5 13h.01M16 16.3c.8-.6 1.8-.6 2.6 0" /></>,
);
export const IconMic = make('Mic', <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.8 11a6.2 6.2 0 0 0 12.4 0M12 17.2V21M9 21h6" /></>);
export const IconPiano = make('Piano', <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M8 19v-5M12 19v-5M16 19v-5" /><path d="M7 5v9h2V5M11 5v9h2V5M15 5v9h2V5" /></>);
export const IconBalloon = make('Balloon', <><path d="M12 15c-3 0-5-2.7-5-6a5 5 0 0 1 10 0c0 3.3-2 6-5 6Z" /><path d="M11 16.5h2L12 15ZM12 16.5c-1.2 1.5 1.2 2.5 0 4.5" /></>);
export const IconTrophy = make('Trophy', <><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5.2a3 3 0 0 0 3 4M16 6h2.8a3 3 0 0 1-3 4" /><path d="M12 13v3.5M8.5 20.5h7M9.5 20.5c0-2 1-4 2.5-4s2.5 2 2.5 4" /></>);
export const IconSpeaker = make('Speaker', <><rect x="6" y="3" width="12" height="18" rx="2.5" /><circle cx="12" cy="14" r="3.2" /><circle cx="12" cy="7.5" r="1.3" /></>);
