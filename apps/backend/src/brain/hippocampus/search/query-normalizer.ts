import { Injectable } from '@nestjs/common';
import * as nodejieba from 'nodejieba';
import { eng, removeStopwords, zho } from 'stopword';

const CUSTOM_STOPWORDS = [
  'memory',
  '系统',
  '今天',
  '我们',
  '讨论',
];

const STOPWORDS = [...eng, ...zho, ...CUSTOM_STOPWORDS];
const CJK_RE = /[\u3400-\u9fff]/;

@Injectable()
export class QueryNormalizer {
  normalize(rawQuery: string): string {
    const compact = rawQuery.trim().replace(/\s+/g, ' ');
    if (!compact) return '';

    const cleaned = compact.replace(/[(){}\[\]:;,+*^~!]/g, ' ');
    const coarseTerms = cleaned
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/"/g, ''));

    const terms: string[] = [];
    for (const term of coarseTerms) {
      if (!term) continue;
      if (CJK_RE.test(term)) {
        terms.push(term);
        terms.push(
          ...nodejieba
            .cut(term)
            .map((part) => part.trim())
            .filter(Boolean),
        );
      } else {
        terms.push(term.toLowerCase());
      }
    }

    const normalizedTerms = terms.filter((part) => /[\p{L}\p{N}]/u.test(part));

    const filtered = removeStopwords(normalizedTerms, STOPWORDS);
    const dedupedFiltered = this.deduplicate(filtered);
    const dedupedFallback = this.deduplicate(normalizedTerms);

    return (dedupedFiltered.length > 0 ? dedupedFiltered : dedupedFallback).join(' ');
  }

  private deduplicate(terms: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const term of terms) {
      if (seen.has(term)) continue;
      seen.add(term);
      out.push(term);
    }
    return out;
  }
}
