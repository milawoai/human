const OPEN = '<human_speech_summary>';
const CLOSE = '</human_speech_summary>';

/** Transient model instruction; never persist it as the session's base prompt. */
export function speechSystemPrompt(base: string, enabled: boolean): string {
  if (!enabled) return base;
  return `${base}\n\n[会话总结播报协议]\n正常回答用户，保留完整正文。仅在本轮最终回复末尾另起一行输出 ${OPEN}{"text":"播报文本"}${CLOSE}，此块后不要输出任何内容。text 为严格 JSON 字符串：用用户的语言，1～2句，最多80个字符，简要总结本次实际做了什么、关键结果或待用户决定的问题；没有执行操作就总结回答要点，不得声称未完成的工作已经完成。不要包含思考过程、代码、命令、文件路径、URL、Markdown或工具调用细节。只在最终答复附加一次，不在中间工具调用回复中附加。`;
}

/** Hide even a partially streamed protocol opening tag. */
export function visibleSpeechAnswer(raw: string): string {
  const start = raw.indexOf(OPEN);
  if (start >= 0) return raw.slice(0, start);
  for (let n = Math.min(raw.length, OPEN.length - 1); n > 0; n--) {
    if (raw.endsWith(OPEN.slice(0, n))) return raw.slice(0, -n);
  }
  return raw;
}

export function validSpeechSummary(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && Array.from(value).length <= 80 &&
    !/[`<>\n\r]|https?:\/\/|(?:^|\s)(?:\/|~\/|[a-z]:\\)|[\/#*]/i.test(value);
}

export function splitSpeechSummary(raw: string, enabled: boolean): { answer: string; summary?: string } {
  if (!enabled) return { answer: raw };
  const start = raw.indexOf(OPEN);
  if (start < 0) return { answer: visibleSpeechAnswer(raw).trim() };
  const answer = raw.slice(0, start).trim();
  if (!answer) return { answer };
  const tail = raw.slice(start + OPEN.length);
  if (!tail.endsWith(CLOSE) || tail.includes(OPEN)) return { answer };
  try {
    const parsed = JSON.parse(tail.slice(0, -CLOSE.length));
    if (parsed && validSpeechSummary(parsed.text)) return { answer, summary: parsed.text.trim() };
  } catch { /* Malformed summaries are silent; never synthesize the full answer. */ }
  return { answer };
}

/** Strip protocol blocks from public/persisted assistant snapshots, preserving tool calls. */
export function speechDisplayMessage(message: any): any {
  if (message?.role !== 'assistant') return message;
  if (typeof message.content === 'string') return { ...message, content: visibleSpeechAnswer(message.content) };
  if (!Array.isArray(message.content)) return message;
  let text = '';
  let visibleLength = 0;
  return { ...message, content: message.content.map((part: any) => {
    if (part.type !== 'text') return part;
    text += part.text ?? '';
    const visible = visibleSpeechAnswer(text);
    const next = visible.slice(visibleLength);
    visibleLength = visible.length;
    return { ...part, text: next };
  }) };
}
