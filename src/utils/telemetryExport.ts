import type { SimConfig, TelemetrySnapshot } from '../types/simulation';
import { formatClockSeconds } from './cibse';

export function serializeTelemetryCsv(snapshot: TelemetrySnapshot): string {
  const header = [
    'sim_time_sec',
    'clock',
    'left_queue',
    'right_queue',
    'left_awt_s',
    'right_awt_s',
    'left_att_s',
    'right_att_s',
    'left_attd_s',
    'right_attd_s',
    'left_rtt_s',
    'right_rtt_s',
    'left_interval_s',
    'right_interval_s',
    'left_hc5_pct',
    'right_hc5_pct',
    'left_throughput_m',
    'right_throughput_m',
    'left_wh_pax',
    'right_wh_pax',
  ].join(',');

  const len = Math.max(snapshot.leftSeries.length, snapshot.rightSeries.length);
  const lines = [header];

  for (let i = 0; i < len; i++) {
    const l = snapshot.leftSeries[i];
    const r = snapshot.rightSeries[i];
    const simTime = l?.simTime ?? r?.simTime ?? 0;

    lines.push(
      [
        simTime,
        formatClockSeconds(simTime),
        l ? l.queue : 0,
        r ? r.queue : 0,
        l ? l.avgWait.toFixed(2) : '0.00',
        r ? r.avgWait.toFixed(2) : '0.00',
        l ? l.avgTransit.toFixed(2) : '0.00',
        r ? r.avgTransit.toFixed(2) : '0.00',
        l ? l.avgTTD.toFixed(2) : '0.00',
        r ? r.avgTTD.toFixed(2) : '0.00',
        l ? l.avgRTT.toFixed(2) : '0.00',
        r ? r.avgRTT.toFixed(2) : '0.00',
        l ? l.lobbyInterval.toFixed(2) : '0.00',
        r ? r.lobbyInterval.toFixed(2) : '0.00',
        l ? l.hc5Pct.toFixed(2) : '0.00',
        r ? r.hc5Pct.toFixed(2) : '0.00',
        l ? l.throughput.toFixed(2) : '0.00',
        r ? r.throughput.toFixed(2) : '0.00',
        l ? l.whPerPax.toFixed(2) : '0.00',
        r ? r.whPerPax.toFixed(2) : '0.00',
      ].join(',')
    );
  }

  return lines.join('\n');
}

export function serializeTelemetryJson(
  snapshot: TelemetrySnapshot,
  config?: Partial<SimConfig>
): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    simTime: Number(snapshot.simTime.toFixed(2)),
    clockText: snapshot.clockText,
    config: config ?? null,
    cibseBenchmark: snapshot.cibseBenchmark,
    left: {
      algorithm: snapshot.leftAlgorithm,
      telemetry: snapshot.left,
      percentiles: {
        wait: {
          p25: snapshot.left.p25Wait,
          p50: snapshot.left.p50Wait,
          p75: snapshot.left.p75Wait,
          p90: snapshot.left.p90Wait,
          p95: snapshot.left.p95Wait,
        },
        ttd: {
          p25: snapshot.left.p25TTD,
          p50: snapshot.left.p50TTD,
          p75: snapshot.left.p75TTD,
          p90: snapshot.left.p90TTD,
          p95: snapshot.left.p95TTD,
        },
      },
      samples: snapshot.leftSamples,
    },
    right: {
      algorithm: snapshot.rightAlgorithm,
      telemetry: snapshot.right,
      percentiles: {
        wait: {
          p25: snapshot.right.p25Wait,
          p50: snapshot.right.p50Wait,
          p75: snapshot.right.p75Wait,
          p90: snapshot.right.p90Wait,
          p95: snapshot.right.p95Wait,
        },
        ttd: {
          p25: snapshot.right.p25TTD,
          p50: snapshot.right.p50TTD,
          p75: snapshot.right.p75TTD,
          p90: snapshot.right.p90TTD,
          p95: snapshot.right.p95TTD,
        },
      },
      samples: snapshot.rightSamples,
    },
    history: {
      left: snapshot.leftSeries,
      right: snapshot.rightSeries,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
