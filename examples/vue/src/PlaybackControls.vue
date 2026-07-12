<script setup lang="ts">
import { BEHAVIOR_OPTIONS } from '@chat-scroll/example-shared'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import type { UsePlaybackReturn } from './use-playback'

const props = defineProps<{ playback: UsePlaybackReturn }>()

function onIntervalInput(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n) && n >= 10) props.playback.setIntervalMs(n)
}

function onBehaviorChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value as ChatScrollBehavior
  props.playback.setScrollBehavior(v)
}

function onDurationInput(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n) && n >= 0) props.playback.setScrollDurationMs(n)
}
</script>

<template>
  <label class="playback">
    interval
    <input
      type="number"
      min="10"
      max="2000"
      step="10"
      data-test="interval"
      :value="props.playback.intervalMs.value"
      @input="onIntervalInput"
    />
    ms
  </label>
  <label class="behavior">
    scroll
    <select
      data-test="behavior"
      :value="props.playback.scrollBehavior.value"
      @change="onBehaviorChange"
    >
      <option v-for="b in BEHAVIOR_OPTIONS" :key="b" :value="b">{{ b }}</option>
    </select>
  </label>
  <label class="duration">
    duration
    <input
      type="number"
      min="0"
      max="2000"
      step="20"
      data-test="duration"
      :value="props.playback.scrollDurationMs.value"
      @input="onDurationInput"
    />
    ms
  </label>
  <label v-if="props.playback.supportsGutter" class="gutter-toggle">
    <input
      type="checkbox"
      data-test="show-gutter"
      :checked="props.playback.showGutter.value"
      @change="
        (e) =>
          props.playback.setShowGutter((e.target as HTMLInputElement).checked)
      "
    />
    show gutter
  </label>
  <button
    data-test="auto-tick"
    :data-running="props.playback.running.value ? 'true' : 'false'"
    @click="props.playback.toggle()"
  >
    {{ props.playback.running.value ? 'Pause stream' : 'Resume stream' }}
  </button>
</template>
