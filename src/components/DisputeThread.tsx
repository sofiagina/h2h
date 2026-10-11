import { useState, type FormEvent } from 'react';
import type { Attachment, DisputeAuthor, DisputeMessage } from '../api';
import { fileSize } from '../lib/files';
import { dateTime } from '../lib/format';
import { FileDrop } from './FileDrop';
import { ErrorBox } from './ui';

const AUTHOR: Record<DisputeAuthor, string> = { buyer: 'Покупатель', seller: 'Продавец', support: 'Поддержка Hand2Hand' };

function AttachmentItem({ a }: { a: Attachment }) {
  if (a.url && a.mime.startsWith('image/'))
    return (
      <a className="att att--image" href={a.url} target="_blank" rel="noreferrer" title={a.name}>
        <img src={a.url} alt={a.name} />
      </a>
    );
  const kind = a.mime.startsWith('video/') ? 'видео' : a.mime === 'application/pdf' ? 'PDF' : 'файл';
  const body = (
    <>
      <span className="file-kind">{kind}</span>
      <span className="att__name">
        {a.name}
        <small>{a.url ? fileSize(a.size) : `${fileSize(a.size)} · в демо хранится только имя`}</small>
      </span>
    </>
  );
  return a.url ? (
    <a className="att" href={a.url} target="_blank" rel="noreferrer" download={a.name}>
      {body}
    </a>
  ) : (
    <div className="att att--missing">{body}</div>
  );
}

export function MessageList({ messages, viewer }: { messages: DisputeMessage[]; viewer: DisputeAuthor }) {
  return (
    <ol className="thread">
      {messages.map((m) => (
        <li key={m.id} className={`msg msg--${m.author} ${m.author === viewer ? 'msg--mine' : ''}`}>
          <div className="msg__head">
            <b>{m.author === viewer ? 'Вы' : AUTHOR[m.author]}</b>
            <span>{dateTime(m.at)}</span>
          </div>
          {m.text && <p>{m.text}</p>}
          {m.attachments.length > 0 && (
            <div className="msg__files">
              {m.attachments.map((a) => (
                <AttachmentItem key={a.id} a={a} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

interface ComposerProps {
  placeholder: string;
  submitLabel: string;
  minLength?: number;
  onSend(text: string, files: File[]): Promise<void>;
}

/** Поле сообщения с файлами: используется и для открытия спора, и для ответов в нём. */
export function Composer({ placeholder, submitLabel, minLength = 0, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSend(text, files);
      setText('');
      setFiles([]);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  const empty = text.trim().length < minLength && (minLength > 0 || files.length === 0);

  return (
    <form className="composer" onSubmit={submit}>
      <textarea className="input" rows={3} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <FileDrop files={files} onChange={setFiles} />
      {error && <ErrorBox error={error} />}
      <button className="btn btn--primary" disabled={busy || empty}>
        {busy ? 'Отправляем…' : submitLabel}
      </button>
    </form>
  );
}
