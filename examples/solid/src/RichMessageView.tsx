import { createSignal, Index, Match, Switch, untrack } from 'solid-js'
import type {
  Part,
  RichMessage,
  TextPart,
  ThinkingPart,
  ToolPart,
} from './use-rich-chat'

export function MessageView(props: { msg: RichMessage }) {
  return (
    <div
      class={props.msg.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
      data-test={props.msg.role === 'user' ? 'user-msg' : 'bot-msg'}
    >
      <Index each={props.msg.parts}>
        {(part, i) => <PartView part={part} index={i} />}
      </Index>
    </div>
  )
}

// `<Index>` keeps each slot's local component state stable across
// streaming updates — text grows, body grows, but the block at index N
// is never re-instantiated, so the user-toggled `open` signal persists.
function PartView(props: { part: () => Part; index: number }) {
  return (
    <Switch>
      <Match when={props.part().type === 'text'}>
        <div class="msg__text">{(props.part() as TextPart).text}</div>
      </Match>
      <Match when={props.part().type === 'thinking'}>
        <Block
          kind="thinking"
          part={props.part as () => ThinkingPart}
          index={props.index}
        />
      </Match>
      <Match when={props.part().type === 'tool'}>
        <Block
          kind="tool"
          part={props.part as () => ToolPart}
          index={props.index}
        />
      </Match>
    </Switch>
  )
}

function Block(props: {
  kind: 'thinking' | 'tool'
  part: () => ThinkingPart | ToolPart
  index: number
}) {
  // Initial value only — a Block keeps its local open state for its
  // lifetime, so this read is deliberately untracked.
  const [open, setOpen] = createSignal(untrack(() => props.part().defaultOpen))
  const title = () =>
    props.kind === 'thinking'
      ? (props.part() as ThinkingPart).summary
      : (props.part() as ToolPart).name
  const args = () =>
    props.kind === 'tool' ? (props.part() as ToolPart).args : ''
  const body = () =>
    props.kind === 'thinking'
      ? (props.part() as ThinkingPart).body
      : (props.part() as ToolPart).result

  return (
    <div
      class={
        props.kind === 'thinking'
          ? 'block block--thinking'
          : 'block block--tool'
      }
      data-test="expand-block"
      data-block-index={props.index}
      data-open={open() ? 'true' : 'false'}
    >
      <button
        class="block__summary"
        type="button"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="block__icon" aria-hidden="true">
          {props.kind === 'thinking' ? '💭' : '🛠'}
        </span>
        <span class="block__title">
          {title()}
          <Switch>
            <Match when={props.kind === 'tool'}>
              <span class="block__args">{args()}</span>
            </Match>
          </Switch>
        </span>
        <span class="block__chev" aria-hidden="true">
          ▾
        </span>
      </button>
      <div class="block__wrap">
        <div class="block__body">
          <Switch>
            <Match when={props.kind === 'tool'}>
              <pre class="block__pre">{body()}</pre>
            </Match>
            <Match when={props.kind === 'thinking'}>{body()}</Match>
          </Switch>
        </div>
      </div>
    </div>
  )
}
