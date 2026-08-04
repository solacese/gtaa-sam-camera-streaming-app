<script>
  import { onMount, onDestroy } from 'svelte';
  import { v4 as uuidv4 } from 'uuid';
  import MarkdownIt from 'markdown-it';
  import { APP_CONFIG, DEMO_MODE } from './common/config';
  import { TERMINAL_SAMPLES, tierColor } from './common/airlines';

  /**
   * Submits a sample terminal image on the capacity-analysis topic and renders
   * the markdown verdict that comes back on the result topic. Mirrors the
   * request/result flow of the SAM image-analysis application.
   */
  let { solaceClient, activeAirlineId = null } = $props();

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true
  });

  let analysisPayload = $state(null);
  let analysisHtml = $state('');
  let analysisLoading = $state(false);
  let submittedSample = $state(null);
  let requestCount = $state(0);
  let lastRequest = $state(null);

  function repairUtf8Mojibake(text) {
    // UTF-8 bytes decoded as Latin-1/Windows-1252 always show up as a lead byte
    // (U+00C2-U+00F4) followed by a continuation byte (U+0080-U+00BF). If we do
    // not see that pattern, the text is not mojibake and we leave it untouched.
    // Built from a string so the source file stays ASCII-only — a literal
    // U+0080 inside a regex body is invisible and easily corrupted in transit.
    const MOJIBAKE = new RegExp('[\\u00C2-\\u00F4][\\u0080-\\u00BF]');
    if (!MOJIBAKE.test(text)) {
      return text;
    }
    try {
      const bytes = new Uint8Array([...text].map((char) => char.charCodeAt(0) & 0xff));
      // fatal: true so a false positive (real Unicode that is not valid re-decoded
      // UTF-8) throws and we keep the original instead of emitting replacement chars.
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return text;
    }
  }

  function renderMarkdown(markdown) {
    if (!markdown) return '';

    // Reverse UTF-8-as-Latin-1 mojibake so emoji reach the renderer intact.
    const repaired = repairUtf8Mojibake(markdown);

    // Decode HTML entities that some producers emit instead of raw characters.
    const decoded = repaired
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');

    return md.render(decoded);
  }

  function handleResult(message) {
    const text = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    analysisPayload = text;
    analysisHtml = renderMarkdown(text);
    analysisLoading = false;
  }

  async function submitSample(sample) {
    analysisLoading = true;
    analysisPayload = null;
    analysisHtml = '';
    submittedSample = sample;

    const payload = {
      requestId: uuidv4(),
      file: sample.filename,
      imageUrl: `${window.location.origin}/images/${sample.filename}`,
      terminal: sample.terminal,
      zone: sample.zone,
      reportedTier: sample.tier,
      reportedOccupancyPct: sample.occupancyPct,
      activeAirlineId,
      capturedAt: new Date().toISOString(),
      source: 'gtaa-control-panel'
    };

    lastRequest = payload;
    requestCount += 1;
    solaceClient.publishControl(APP_CONFIG.analysisTopic, payload);

    if (DEMO_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      handleResult(buildDemoResult(sample, payload));
    }
  }

  /** Stand-in verdict used when no analysis service is on the other end. */
  function buildDemoResult(sample, payload) {
    const dwell = Math.round(4 + (sample.occupancyPct / 100) * 26);
    const desks = Math.max(2, Math.round(12 - (sample.occupancyPct / 100) * 6));
    const verdict = {
      quiet: 'Within comfort target. No action required.',
      light: 'Within comfort target. Continue routine monitoring.',
      moderate: 'Approaching advisory threshold. Stage additional agents.',
      busy: 'Advisory threshold exceeded. Open overflow lanes now.',
      critical: 'Level of service breached. Escalate to Terminal Duty Manager.'
    }[sample.tier];

    const actions = {
      quiet: ['Consolidate to a single bank of counters.', 'Redeploy two agents to bag drop.'],
      light: ['Hold current counter allocation.', 'Re-check queue at the next departure bank.'],
      moderate: [
        'Open two additional check-in positions.',
        'Deploy a queue marshal at the hall entrance.',
        'Push a wait-time advisory to the airline app.'
      ],
      busy: [
        'Open all remaining positions in the zone.',
        'Activate the overflow queue lane toward Zone D.',
        'Notify security screening of an inbound surge.'
      ],
      critical: [
        'Activate the full overflow footprint immediately.',
        'Hold arriving passengers at the curb-side entry.',
        'Notify security screening and the Terminal Duty Manager.',
        'Publish a delay advisory on the departures boards.'
      ]
    }[sample.tier];

    return [
      '# Terminal Capacity Assessment',
      '',
      `**Location:** ${sample.terminal} · ${sample.zone}`,
      `**Frame:** \`${sample.filename}\``,
      `**Routed airline:** ${activeAirlineId ?? 'none'}`,
      '',
      '## Measured',
      '',
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Hall occupancy | **${sample.occupancyPct}%** |`,
      `| Capacity tier | **${sample.tier.toUpperCase()}** |`,
      `| Estimated queue dwell | **${dwell} min** |`,
      `| Recommended open desks | **${desks}** |`,
      '',
      '## Assessment',
      '',
      verdict,
      '',
      '## Recommended actions',
      '',
      ...actions.map((action) => `- ${action}`),
      '',
      '---',
      '',
      '_Simulated result — `VITE_DEMO_MODE=true`, no analysis service was consulted._',
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```'
    ].join('\n');
  }

  onMount(() => {
    solaceClient.subscribeToTopic(APP_CONFIG.resultTopic, handleResult);
  });

  onDestroy(() => {
    solaceClient.unsubscribeFromTopic(APP_CONFIG.resultTopic, handleResult);
  });
</script>

<section class="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
  <!-- Panel header -->
  <div class="bg-gradient-to-r from-gtaa-blue to-gtaa-blue-deep px-5 py-4 text-white">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="font-display text-lg font-semibold">Terminal Capacity Analysis</h2>
        <p class="text-xs text-white/80">Submit a concourse frame and render the verdict</p>
      </div>
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-white/15 px-3 py-1">{requestCount} submitted</span>
        {#if analysisLoading}
          <span class="rounded-full bg-amber-300/25 px-3 py-1 text-amber-50">Awaiting result</span>
        {:else if analysisPayload}
          <span class="rounded-full bg-emerald-400/25 px-3 py-1 text-emerald-50">Result received</span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Sample images -->
  <div class="border-b border-slate-200 bg-slate-50 p-4">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Sample terminal frames</p>
      <p class="font-mono text-[10px] text-slate-400">→ {APP_CONFIG.analysisTopic}</p>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {#each TERMINAL_SAMPLES as sample (sample.id)}
        {@const color = tierColor(sample.tier)}
        {@const selected = submittedSample?.id === sample.id}
        <button
          type="button"
          onclick={() => submitSample(sample)}
          title={sample.description}
          class="group overflow-hidden rounded-2xl border-2 bg-white text-left transition hover:shadow-md"
          style="border-color: {selected ? color : '#E2E8F0'};"
        >
          <div class="relative aspect-[8/5] w-full overflow-hidden bg-gtaa-ink">
            <img
              src={`/images/${sample.filename}`}
              alt={`${sample.terminal} at ${sample.occupancyPct}% occupancy`}
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span
              class="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold text-white"
              style="background: {color};"
            >
              {sample.occupancyPct}%
            </span>
            {#if selected}
              <span class="absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-bold uppercase tracking-widest text-white" style="background: {color};">
                Submitted
              </span>
            {/if}
          </div>
          <div class="px-2 py-1.5">
            <p class="truncate text-[11px] font-semibold text-slate-800 group-hover:text-gtaa-blue">{sample.label}</p>
            <p class="truncate text-[9px] text-slate-400">{sample.terminal}</p>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- Result area -->
  <div class="flex flex-1 flex-col gap-3 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-gtaa-blue-deep">Analysis result</p>
        <p class="font-mono text-[10px] text-slate-500">← {APP_CONFIG.resultTopic}</p>
      </div>
      {#if analysisLoading}
        <div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <span class="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-gtaa-blue"></span>
          Waiting for payload…
        </div>
      {/if}
    </div>

    <div class="thin-scroll max-h-[36rem] min-h-[16rem] flex-1 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4">
      {#if submittedSample}
        <figure class="mb-4 flex flex-col items-center gap-2 border-b border-slate-100 pb-4">
          <img
            src={`/images/${submittedSample.filename}`}
            alt="Terminal frame under analysis"
            class="max-h-72 w-auto max-w-full rounded-2xl border border-slate-200 object-contain"
          />
          <figcaption class="text-center">
            <span class="block text-xs font-semibold text-slate-700">{submittedSample.label} · {submittedSample.occupancyPct}% occupancy</span>
            <span class="block font-mono text-[10px] text-slate-400">{submittedSample.filename}</span>
          </figcaption>
        </figure>
      {/if}

      {#if analysisLoading}
        <p class="text-sm text-slate-500">
          Request published to <span class="font-mono text-xs">{APP_CONFIG.analysisTopic}</span>. Awaiting the
          analysis result on <span class="font-mono text-xs">{APP_CONFIG.resultTopic}</span>…
        </p>
      {:else if analysisPayload}
        <div class="markdown-body text-slate-800">{@html analysisHtml}</div>
      {:else}
        <div class="space-y-2 text-sm text-slate-500">
          <p>No analysis result yet. Pick a sample terminal frame above to publish a capacity-analysis request.</p>
          <p class="text-xs">
            Requests go out on <span class="font-mono">{APP_CONFIG.analysisTopic}</span>; whatever markdown arrives on
            <span class="font-mono">{APP_CONFIG.resultTopic}</span> is rendered here.
          </p>
        </div>
      {/if}
    </div>

    {#if lastRequest}
      <details class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <summary class="cursor-pointer font-semibold text-slate-700">Last request payload</summary>
        <pre class="thin-scroll mt-2 overflow-x-auto font-mono text-[10px] leading-relaxed text-slate-600">{JSON.stringify(lastRequest, null, 2)}</pre>
      </details>
    {/if}
  </div>
</section>
