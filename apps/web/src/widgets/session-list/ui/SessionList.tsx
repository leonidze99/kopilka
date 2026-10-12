import { Monitor, Smartphone } from 'lucide-react';
import { type AuthSession, useListSessionsQuery } from '@/entities/session';
import {
  EndOtherSessionsButton,
  EndSessionButton,
} from '@/features/session-end';
import {
  errorMessage,
  formatDay,
  formatDayHeading,
  formatTime,
} from '@/shared/lib';
import { FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './SessionList.module.css';

const MOBILE = /iPhone|iPad|Android/;

/** "сегодня в 14:30", "5 октября, воскресенье в 09:12". */
const lastSeen = (iso: string) =>
  `${formatDayHeading(iso).toLowerCase()} в ${formatTime(iso)}`;

function SessionRow({ session }: { session: AuthSession }) {
  const Icon = MOBILE.test(session.device) ? Smartphone : Monitor;
  return (
    <li className={styles.row}>
      <span className={styles.icon} aria-hidden>
        <Icon size={20} />
      </span>
      <span className={styles.main}>
        <span className={styles.device}>
          {session.device}
          {session.current && (
            <span className={styles.current}>Это устройство</span>
          )}
        </span>
        <span className={styles.meta}>
          {session.current
            ? 'Активен сейчас'
            : `Был активен: ${lastSeen(session.lastUsedAt)}`}
          {session.ip && ` · IP ${session.ip}`}
        </span>
        <span className={styles.meta}>Вход {formatDay(session.createdAt)}</span>
      </span>
      {/* This device signs out with the button in the header. */}
      {!session.current && <EndSessionButton session={session} />}
    </li>
  );
}

/** Where the account is signed in, and a way to sign those devices out. */
export function SessionList() {
  const { data, error, isLoading } = useListSessionsQuery();
  const others = (data ?? []).filter((session) => !session.current).length;

  return (
    <Panel title="Устройства">
      <FormError message={error && errorMessage(error)} />
      {isLoading && (
        <div className={styles.skeletons} role="status" aria-label="Загрузка">
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}
      {data && (
        <ul className={styles.list} aria-label="Активные сеансы">
          {data.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </ul>
      )}
      {others > 0 && (
        <div className={styles.footer}>
          <EndOtherSessionsButton />
          <p className={styles.hint}>
            Если не узнаёте устройство — завершите его сеанс и смените пароль.
          </p>
        </div>
      )}
    </Panel>
  );
}
