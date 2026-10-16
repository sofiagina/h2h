import type { Transition, Variants } from 'motion/react';

/** Общие настройки анимаций: короткие, без «прыжков» — интерфейс не должен ждать анимацию. */
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34 };

/** Появление страницы при переходе. */
export const page: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};

/** Список, элементы которого появляются по очереди. */
export const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring },
};

/** Шаги мастера продажи: вперёд — справа налево, назад — наоборот. */
export const stepSlide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, transition: { duration: 0.12 } }),
};
