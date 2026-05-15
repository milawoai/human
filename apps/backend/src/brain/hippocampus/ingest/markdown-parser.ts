import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkObsidian from 'remark-obsidian';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import {
  ParsedMarkdownDocument,
  ParsedMarkdownSection,
} from '../types/memory.types';

type MdastNode = {
  type: string;
  depth?: number;
  children?: MdastNode[];
};

@Injectable()
export class MarkdownParser {
  parse(input: { sourceUri: string; raw: string }): ParsedMarkdownDocument {
    const parsed = matter(input.raw);
    const tree = unified()
      .use(remarkParse)
      .use(remarkObsidian)
      .parse(parsed.content) as MdastNode;

    const sections: ParsedMarkdownSection[] = [];
    let current: ParsedMarkdownSection | null = null;

    visit(tree as never, (node: MdastNode) => {
      if (node.type === 'heading') {
        const title = toString(node as never).trim();
        current = {
          heading: title || undefined,
          depth: node.depth,
          content: '',
        };
        sections.push(current);
        return;
      }

      if (!this.isContentNode(node.type)) {
        return;
      }

      const text = toString(node as never).trim();
      if (!text) {
        return;
      }

      if (!current) {
        current = {
          content: '',
        };
        sections.push(current);
      }

      current.content = current.content ? `${current.content}\n\n${text}` : text;
    });

    const normalizedSections = sections.filter((section) => section.content.trim().length > 0);

    return {
      sourceUri: input.sourceUri,
      title: this.resolveTitle(input.sourceUri, parsed.data, normalizedSections),
      frontmatter: parsed.data as Record<string, unknown>,
      text: normalizedSections.map((section) => section.content).join('\n\n').trim(),
      sections: normalizedSections,
    };
  }

  private isContentNode(type: string): boolean {
    return [
      'paragraph',
      'blockquote',
      'list',
      'table',
      'code',
      'html',
    ].includes(type);
  }

  private resolveTitle(
    sourceUri: string,
    frontmatter: Record<string, unknown>,
    sections: ParsedMarkdownSection[],
  ): string {
    const fmTitle = frontmatter.title;
    if (typeof fmTitle === 'string' && fmTitle.trim()) {
      return fmTitle.trim();
    }

    const firstHeading = sections.find((section) => section.heading)?.heading;
    if (firstHeading) {
      return firstHeading;
    }

    const lastToken = sourceUri.split('/').filter(Boolean).pop() ?? sourceUri;
    return lastToken.replace(/\.md$/i, '');
  }
}
