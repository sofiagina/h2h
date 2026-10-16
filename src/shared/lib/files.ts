import { DISPUTE_FILES } from '@/core/api/types';

export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

/** Проверка до отправки — те же правила бэкенд проверяет у себя. */
export function validateFiles(files: File[]): string | null {
  if (files.length > DISPUTE_FILES.maxFiles) return `Можно приложить до ${DISPUTE_FILES.maxFiles} файлов`;
  const big = files.find((f) => f.size > DISPUTE_FILES.maxBytes);
  if (big) return `Файл «${big.name}» больше ${fileSize(DISPUTE_FILES.maxBytes)}`;
  const bad = files.find((f) => !/^(image\/|video\/|application\/pdf)/.test(f.type));
  if (bad) return `Формат «${bad.name}» не подходит: фото, видео или PDF`;
  return null;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Только для демо-режима: localStorage вмещает несколько мегабайт, поэтому фото
 * ужимаем до 1024 px, мелкие PDF храним как есть, видео и крупные файлы — только по имени.
 */
export async function toDemoUrl(file: File): Promise<string | null> {
  try {
    if (file.type.startsWith('image/')) {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.72);
    }
    if (file.type === 'application/pdf' && file.size < 400 * 1024) return await readAsDataUrl(file);
  } catch {
    /* не смогли прочитать — сохраним только имя */
  }
  return null;
}
