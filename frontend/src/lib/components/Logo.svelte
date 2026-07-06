<script lang="ts">
  // Quadratisches "Wch"-Logo nach draft.png: weißes W, grünes ch auf dunklem Rounded Square
  // Wächst standardmäßig mit der Höhe der Timer-Leiste (Container) bis auf das 3-Fache mit
  let { size = 'clamp(36px, 55cqh, 108px)' }: { size?: string } = $props()
</script>

<svg
  class="logo"
  viewBox="0 0 48 48"
  style="width: {size}; height: {size}"
  role="img"
  aria-label="WODch"
>
  <rect x="1" y="1" width="46" height="46" rx="11" fill="#1a1a1a" stroke="#333" stroke-width="1.5" />
  <text x="23" y="31" text-anchor="middle" font-style="italic" font-weight="900" letter-spacing="-0.5">
    <tspan fill="#fff" font-size="21">W</tspan><tspan fill="#a8d129" font-size="16">ch</tspan>
  </text>
</svg>

<style>
  .logo {
    display: block;
    flex-shrink: 0;
  }
  .logo text {
    font-family: inherit;
    user-select: none;
  }
</style>
