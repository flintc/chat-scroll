import { useState } from 'react'
import type { RichMessage, ThinkingPart, ToolPart } from './use-rich-chat'

export function MessageView({ msg }: { msg: RichMessage }) {
  return (
    <div
      className={msg.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
      data-test={msg.role === 'user' ? 'user-msg' : 'bot-msg'}
    >
      {/*
        `part.id` is assigned once at creation and never shifts, so each
        slot stays stable across streaming updates. The part object is
        replaced on every chunk (immutable update), but the DOM node and
        the child component instance — and its local `open` state —
        survive.
      */}
      {msg.parts.map((part, i) =>
        part.type === 'text' ? (
          <div key={part.id} className="msg__text">
            {part.text}
          </div>
        ) : (
          <Block key={part.id} part={part} index={i} />
        ),
      )}
    </div>
  )
}

function Block({
  part,
  index,
}: {
  part: ThinkingPart | ToolPart
  index: number
}) {
  const [open, setOpen] = useState(part.defaultOpen)
  const title = part.type === 'thinking' ? part.summary : part.name
  const args = part.type === 'tool' ? part.args : ''
  const body = part.type === 'thinking' ? part.body : part.result

  return (
    <div
      className={
        part.type === 'thinking' ? 'block block--thinking' : 'block block--tool'
      }
      data-test="expand-block"
      data-block-index={index}
      data-open={open ? 'true' : 'false'}
    >
      <button
        className="block__summary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="block__icon" aria-hidden="true">
          {part.type === 'thinking' ? '💭' : '🛠'}
        </span>
        <span className="block__title">
          {title}
          {part.type === 'tool' ? (
            <span className="block__args">{args}</span>
          ) : null}
        </span>
        <span className="block__chev" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="block__wrap">
        <div className="block__body">
          {part.type === 'tool' ? (
            <pre className="block__pre">{body}</pre>
          ) : (
            body
          )}
        </div>
      </div>
    </div>
  )
}
