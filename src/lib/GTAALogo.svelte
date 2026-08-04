<script>
  // Stylized recreation of the Toronto Pearson / GTAA identity — an ascending
  // aircraft on a wayfinding-blue tile, tracing a flight path. Not the official
  // trademarked artwork; swap in real brand assets for internal use.
  let {
    size = 44,
    wordmark = true,
    color = '#0057B8',
    accent = '#4FA8E0',
    textColor = '#1F2A44',
    subtitle = 'Greater Toronto Airports Authority'
  } = $props();
</script>

<div class="flex items-center gap-2.5 select-none">
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Toronto Pearson — Greater Toronto Airports Authority"
    class="shrink-0"
  >
    <rect x="2" y="2" width="96" height="96" rx="22" fill={color} />
    <!-- Flight-path arc sweeping behind the aircraft -->
    <path
      d="M 10 82 Q 34 84 52 68 T 90 22"
      fill="none"
      stroke={accent}
      stroke-width="5"
      stroke-linecap="round"
      opacity="0.8"
    />
    <!-- Ascending aircraft -->
    <g transform="rotate(38 50 48)">
      <path
        d="M50 8 C53.5 15 55 26 55 37 L88 60 L88 69 L55 58 L55 76 L65 84 L65 91 L50 87 L35 91 L35 84 L45 76 L45 58 L12 69 L12 60 L45 37 C45 26 46.5 15 50 8 Z"
        fill="#FFFFFF"
      />
    </g>
  </svg>

  {#if wordmark}
    <div class="leading-none">
      <div class="font-display font-bold text-[1.05rem] tracking-tight" style="color: {textColor};">
        Toronto <span style="color: {color};">Pearson</span>
      </div>
      <div class="text-[0.6rem] font-medium tracking-[0.16em] uppercase" style="color: {color}; opacity: 0.75;">
        {subtitle}
      </div>
    </div>
  {/if}
</div>
