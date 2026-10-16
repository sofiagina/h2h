import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { DISPUTE_FILES } from '@/core/api';
import { fileSize, validateFiles } from '@/shared/lib/files';

interface Props {
  files: File[];
  onChange(files: File[]): void;
  hint?: string;
}

/** Выбор и перетаскивание файлов с превью — для споров. */
export function FileDrop({ files, onChange, hint }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);

  function add(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)];
    const problem = validateFiles(next);
    setError(problem);
    if (!problem) onChange(next);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  }

  return (
    <div className="filedrop">
      <div
        className={`filedrop__zone ${over ? 'filedrop__zone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <span className="filedrop__icon" aria-hidden>＋</span>
        <span>
          <b>Приложить фото, видео или PDF</b>
          <small>{hint ?? `До ${DISPUTE_FILES.maxFiles} файлов по ${fileSize(DISPUTE_FILES.maxBytes)}`}</small>
        </span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={DISPUTE_FILES.accept}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
      {files.length > 0 && (
        <ul className="filedrop__list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {previews[i] ? <img src={previews[i]!} alt="" /> : <span className="file-kind">{f.type.startsWith('video/') ? 'видео' : 'PDF'}</span>}
              <span className="filedrop__name">
                {f.name}
                <small>{fileSize(f.size)}</small>
              </span>
              <button type="button" aria-label={`Убрать ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
