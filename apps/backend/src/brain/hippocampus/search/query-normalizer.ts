import { Injectable } from '@nestjs/common';

@Injectable()
export class QueryNormalizer {
  normalize(rawQuery: string): string {
    const compact = rawQuery.trim().replace(/\s+/g, ' ');
    if (!compact) return '';

    const cleaned = compact.replace(/[(){}\[\]:;,+*^~!]/g, ' ');
    const terms = cleaned
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/"/g, ''));

    return terms.join(' ');
  }
}
