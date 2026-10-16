// Поиск QR-кода в файле билета прямо в браузере: PDF рендерим постранично (pdf.js),
// картинку — как есть, и ищем QR (jsQR). Библиотеки тяжёлые, поэтому грузятся только
// когда продавец выбрал файл.
//
// Это первая линия: бэкенд обязан проверить файл сам (ZXing) — фронт можно обойти.

export type QrResult = { found: true; text: string } | { found: false };

/** Сколько страниц PDF смотрим: QR в билетах — на первой, реже на второй. */
const MAX_PAGES = 3;
/** Масштабы рендера страницы: маленький QR на большом листе находится только при увеличении. */
const SCALES = [2, 3.5];
/** Предел стороны холста — больше браузер может не выделить. */
const MAX_SIDE = 4000;

type JsQr = typeof import('jsqr').default;

function scan(jsQR: JsQr, canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

function canvasOf(width: number, height: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * k));
  canvas.height = Math.max(1, Math.round(height * k));
  return { canvas, k };
}

async function fromImage(jsQR: JsQr, file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    // Фото с телефона огромные: пробуем в исходном размере (с пределом) и уменьшенным.
    for (const target of [MAX_SIDE, 1600]) {
      const k = Math.min(1, target / Math.max(bitmap.width, bitmap.height));
      const { canvas } = canvasOf(bitmap.width * k, bitmap.height * k);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const text = scan(jsQR, canvas);
      if (text) return text;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

async function fromPdf(jsQR: JsQr, file: File): Promise<string | null> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    for (let n = 1; n <= Math.min(MAX_PAGES, doc.numPages); n++) {
      const page = await doc.getPage(n);
      for (const scale of SCALES) {
        const viewport = page.getViewport({ scale });
        const { canvas, k } = canvasOf(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d')!;
        // Белый фон: у прозрачного PDF чёрный QR на прозрачном не читается.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // intent 'print' — без requestAnimationFrame: иначе в фоновой вкладке рендер стоит, пока её не откроют.
        await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale: scale * k }), intent: 'print' }).promise;
        const text = scan(jsQR, canvas);
        if (text) return text;
      }
    }
    return null;
  } finally {
    await task.destroy();
  }
}

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Ищет QR в PDF или изображении. Ошибка чтения файла — исключение (битый или запароленный PDF). */
export async function findTicketQr(file: File): Promise<QrResult> {
  const jsQR = (await import('jsqr')).default;
  const text = isPdf(file) ? await fromPdf(jsQR, file) : await fromImage(jsQR, file);
  return text ? { found: true, text } : { found: false };
}
