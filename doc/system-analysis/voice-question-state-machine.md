# Voice Question State Machine (Milestone)

## Scope

This state machine defines the request lifecycle for:
- hearing finalized speech input
- brain rewrite (spoken -> written)
- user confirmation
- brain answer with default RAG

## Context Envelope

Each request should carry:
- `requestId`
- `sessionId`
- `source`
- `createdAt`

## States

- `LISTENING`
- `REWRITING`
- `WAITING_CONFIRM`
- `ANSWERING`
- `DONE`
- `ERROR`

## Transitions

1. `LISTENING -> REWRITING`
- Trigger: `sensory.hearing.question.finalized`
- Required payload: `requestId`, finalized text

2. `REWRITING -> WAITING_CONFIRM`
- Trigger: `brain.cortex.rewrite.completed`
- Required payload: `requestId`, `originalText`, `normalizedQuestion`

3. `WAITING_CONFIRM -> ANSWERING`
- Trigger: `brain.cortex.rewrite.confirmed`
- Required payload: `requestId`, `confirmedQuestion`

4. `ANSWERING -> DONE`
- Trigger: `brain.cortex.answer.completed`

5. `ANSWERING -> ERROR`
- Trigger: `brain.cortex.answer.failed`

## Streaming Events During ANSWERING

- `brain.cortex.answer.stream.think`
- `brain.cortex.answer.stream.chunk`

Note: think stream can be empty by provider behavior and should not block answer rendering.
