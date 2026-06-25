<template>
  <textarea
    class="workout-editor"
    placeholder="WOD eingeben..."
    spellcheck="false"
  />
</template>

<style scoped>
.workout-editor {
  width: 100%;
  height: 100%;
  background: #000;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  line-height: 1.7;
  border: none;
  outline: none;
  resize: none;
  padding: 20px;
}

.workout-editor::placeholder { color: #333; }
</style>
