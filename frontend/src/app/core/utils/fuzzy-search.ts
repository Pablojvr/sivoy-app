type SearchableValue = string | number | null | undefined;

export interface FuzzySearchOptions<T> {
  fields: (item: T) => readonly SearchableValue[];
  limit?: number;
}

interface RankedItem<T> {
  item: T;
  index: number;
  score: number;
}

export function normalizeSearchText(value: SearchableValue): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  options: FuzzySearchOptions<T>
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const ranked: RankedItem<T>[] = [];

  items.forEach((item, index) => {
    const fields = options.fields(item)
      .map(normalizeSearchText)
      .filter(Boolean);
    const searchableTexts = [...fields, fields.join(' ')];
    const scores = searchableTexts
      .map(text => scoreText(normalizedQuery, text))
      .filter((score): score is number => score !== null);

    if (scores.length > 0) {
      ranked.push({ item, index, score: Math.min(...scores) });
    }
  });

  ranked.sort((a, b) => a.score - b.score || a.index - b.index);

  const limit = options.limit ?? ranked.length;
  return ranked.slice(0, Math.max(0, limit)).map(match => match.item);
}

function scoreText(query: string, text: string): number | null {
  if (!text) return null;
  if (text === query) return 0;
  if (text.startsWith(query)) return 0.04 + query.length / Math.max(text.length, 1) / 100;

  const inclusionIndex = text.indexOf(query);
  if (inclusionIndex >= 0) return 0.1 + inclusionIndex / Math.max(text.length, 1) / 10;

  const queryTokens = query.split(' ');
  const textTokens = text.split(' ');
  const tokenScores = queryTokens.map(queryToken => bestTokenScore(queryToken, textTokens));
  if (tokenScores.some(score => score === null)) return null;

  const totalTokenScore = tokenScores.reduce<number>((total, score) => total + (score ?? 0), 0);
  return 0.16 + totalTokenScore / tokenScores.length;
}

function bestTokenScore(queryToken: string, textTokens: readonly string[]): number | null {
  let bestScore: number | null = null;

  textTokens.forEach(textToken => {
    const score = scoreToken(queryToken, textToken);
    if (score !== null && (bestScore === null || score < bestScore)) bestScore = score;
  });

  return bestScore;
}

function scoreToken(queryToken: string, textToken: string): number | null {
  if (queryToken === textToken) return 0;
  if (textToken.startsWith(queryToken)) {
    return 0.03 + queryToken.length / Math.max(textToken.length, 1) / 100;
  }
  if (queryToken.length < 3) return null;

  const maxDistance = Math.min(2, Math.max(1, Math.floor(queryToken.length * 0.25)));
  const distance = damerauLevenshtein(queryToken, textToken, maxDistance);
  if (distance > maxDistance) return null;

  return 0.28 + distance / Math.max(queryToken.length, textToken.length);
}

function damerauLevenshtein(source: string, target: string, maxDistance: number): number {
  if (Math.abs(source.length - target.length) > maxDistance) return maxDistance + 1;

  const matrix = Array.from(
    { length: source.length + 1 },
    () => new Array<number>(target.length + 1).fill(0)
  );

  for (let row = 0; row <= source.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= target.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );

      if (
        row > 1 &&
        column > 1 &&
        source[row - 1] === target[column - 2] &&
        source[row - 2] === target[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }

  return matrix[source.length][target.length];
}
