/**
 * Public verification shows only initials: "Anika Sharma" -> "A**** S****".
 * A fixed number of stars so the name's length is not leaked either.
 */
export function maskName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${(Array.from(word)[0] ?? '').toUpperCase()}****`)
    .join(' ');
}
