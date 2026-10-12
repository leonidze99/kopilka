/**
 * "Chrome, Windows" from a User-Agent header: enough for a person to tell
 * their devices apart. Not a full parser (and not trusted for anything):
 * the header is whatever the client chose to send.
 */
const BROWSERS: [RegExp, string][] = [
  // Order matters: Edge, Opera and Yandex also say "Chrome", Chrome says "Safari".
  [/YaBrowser\//, 'Яндекс Браузер'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  // iPadOS and Android say "Mac" and "Linux" too: check them first.
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const first = (ua: string, list: [RegExp, string][]) =>
  list.find(([pattern]) => pattern.test(ua))?.[1];

export function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Неизвестное устройство';
  const parts = [first(ua, BROWSERS), first(ua, SYSTEMS)].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Неизвестное устройство';
}
