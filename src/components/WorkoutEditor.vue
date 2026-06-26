<template>
  <div class="workout-wrapper">
    <div
      class="workout-editor"
      contenteditable="true"
      spellcheck="false"
      data-placeholder="WOD eingeben..."
    />
  </div>
</template>

<style scoped>
.workout-wrapper {
  width: 100%;
  height: 100%;
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow-y: auto;
}

.workout-editor {
  width: 100%;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: clamp(16px, 6cqw, 9999px);
  line-height: 1.7;
  outline: none;
  padding: 20px;
  text-align: center;
  white-space: pre-wrap;
  word-break: break-word;
}

.workout-editor:empty::before {
  content: attr(data-placeholder);
  color: #333;
}
</style>
