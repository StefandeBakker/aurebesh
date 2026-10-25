/**
 * Taking characters off the ends of a text. A regular expression for it (`/x+$/`, `/^[a.]+|[a.]+$/g`) can start matching anywhere in a
 * long run of those characters and has to go over the run again for each one: for a text of a million spaces that takes minutes. These
 * look at each end once.
 */

/** The text without the characters of `chars` at its end. */
export function stripEnd(text: string, chars: string): string {
  let end = text.length;
  while (end > 0 && chars.includes(text[end - 1])) end--;
  return end === text.length ? text : text.slice(0, end);
}

/** The text without the characters of `chars` at its start. */
export function stripStart(text: string, chars: string): string {
  let start = 0;
  while (start < text.length && chars.includes(text[start])) start++;
  return start === 0 ? text : text.slice(start);
}

/** The text without the characters of `chars` at both ends. */
export const strip = (text: string, chars: string): string => stripStart(stripEnd(text, chars), chars);
