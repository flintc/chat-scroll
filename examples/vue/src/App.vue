<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import PinToTop from './scenarios/PinToTop.vue'
import PinToTopSimple from './scenarios/PinToTopSimple.vue'
import StickToBottom from './scenarios/StickToBottom.vue'
import ThreadSwitch from './scenarios/ThreadSwitch.vue'
import SideBySide from './scenarios/SideBySide.vue'

const SCENARIOS = [
  { slug: 'pin-to-top', title: 'Pin to top' },
  { slug: 'pin-to-top-simple', title: 'Pin to top (simple)' },
  { slug: 'stick-to-bottom', title: 'Stick to bottom' },
  { slug: 'thread-switch', title: 'Thread switch' },
  { slug: 'side-by-side', title: 'Side by side' },
]

const slug = ref(window.location.hash.replace(/^#\/?/, '') || 'pin-to-top')

function onHash() {
  slug.value = window.location.hash.replace(/^#\/?/, '') || 'pin-to-top'
}

onMounted(() => window.addEventListener('hashchange', onHash))
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))

const current = computed(() => slug.value)
</script>

<template>
  <header class="demo-bar">
    <a
      v-for="s in SCENARIOS"
      :key="s.slug"
      :href="`#/${s.slug}`"
      :class="{ active: current === s.slug }"
    >
      {{ s.title }}
    </a>
  </header>
  <section
    style="flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0"
  >
    <PinToTop v-if="current === 'pin-to-top'" :key="'pin-to-top'" />
    <PinToTopSimple
      v-else-if="current === 'pin-to-top-simple'"
      :key="'pin-to-top-simple'"
    />
    <StickToBottom
      v-else-if="current === 'stick-to-bottom'"
      :key="'stick-to-bottom'"
    />
    <ThreadSwitch
      v-else-if="current === 'thread-switch'"
      :key="'thread-switch'"
    />
    <SideBySide v-else-if="current === 'side-by-side'" :key="'side-by-side'" />
  </section>
</template>
