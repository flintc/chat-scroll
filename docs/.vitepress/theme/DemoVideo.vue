<script setup lang="ts">
import { withBase } from 'vitepress'

/**
 * Embed a recorded e2e demo video. The file lives at
 * `docs/public/videos/<name>.webm` and was produced by `pnpm e2e` then
 * promoted manually after a human reviewed the recording. `withBase`
 * makes the URL work both locally (base `/`) and on GH Pages
 * (`/chat-scroll/`).
 */
defineProps<{
  /** Video file stem under /videos/, e.g. "vanilla__pin-to-top". */
  name: string
  /** Optional caption shown under the video. */
  caption?: string
}>()
</script>

<template>
  <figure class="demo-video">
    <video
      :src="withBase(`/videos/${name}.webm`)"
      controls
      muted
      loop
      playsinline
      preload="metadata"
    />
    <figcaption v-if="caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.demo-video {
  margin: 1.5em 0;
}
.demo-video video {
  display: block;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.demo-video figcaption {
  text-align: center;
  margin-top: 0.5em;
  font-size: 0.875em;
  color: var(--vp-c-text-2);
}
</style>
