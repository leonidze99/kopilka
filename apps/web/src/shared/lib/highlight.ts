/** As the API compares: lower case, ё as е. Keeps every character in place. */
const fold = (text: string) => text.toLowerCase().replaceAll('ё', 'е');

/**
 * `text` cut into pieces, the ones matching `query` marked: for <mark>.
 * Same rules as the search itself, so "пятерочка" marks "Пятёрочка".
 */
export function highlight(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const needle = fold(query.trim());
  if (!needle) return [{ text, match: false }];
  const haystack = fold(text);
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, from)
  ) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
