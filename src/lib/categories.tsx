import type { EventGroup } from '../api';
import {
  IconBalloon,
  IconMasks,
  IconMic,
  IconMusic,
  IconPiano,
  IconSpeaker,
  IconTent,
  IconTrophy,
} from '../components/icons';

export interface Category {
  slug: EventGroup;
  title: string;
  Icon: typeof IconMusic;
  /** Цвет иконки — свой у каждой категории, как метка. */
  color: string;
}

export const CATEGORIES: Category[] = [
  { slug: 'concerts', title: 'Концерты', Icon: IconMusic, color: '#38bdf8' },
  { slug: 'festivals', title: 'Фестивали', Icon: IconTent, color: '#f59e0b' },
  { slug: 'theatre', title: 'Театр', Icon: IconMasks, color: '#f43f5e' },
  { slug: 'standup', title: 'Стендап', Icon: IconMic, color: '#2dd4bf' },
  { slug: 'classic', title: 'Классика', Icon: IconPiano, color: '#a78bfa' },
  { slug: 'kids', title: 'Детям', Icon: IconBalloon, color: '#fb7185' },
  { slug: 'sport', title: 'Спорт', Icon: IconTrophy, color: '#22c55e' },
  { slug: 'club', title: 'Клубы', Icon: IconSpeaker, color: '#94a3b8' },
];

export const categoryOf = (slug: EventGroup) => CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0];
