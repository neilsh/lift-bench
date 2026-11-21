export type ShortcutAction =
  | 'togglePause'
  | 'speed1x'
  | 'speed3x'
  | 'speed8x'
  | 'burst'
  | 'toggleHeatmap'
  | 'toggleFireAlarm'
  | 'reset'
  | 'openMetrics'
  | 'openGuide'
  | 'openShortcuts';

export type ShortcutGroupId = 'playback' | 'controls' | 'views';

export interface ShortcutDefinition {
  readonly action: ShortcutAction;
  readonly key: string;
  readonly displayKey: string;
  readonly label: string;
  readonly group: ShortcutGroupId;
}

export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroupId, string> = {
  playback: 'Playback',
  controls: 'Simulation Controls',
  views: 'Views & Help',
};

export const SHORTCUT_GROUP_ORDER: readonly ShortcutGroupId[] = ['playback', 'controls', 'views'];

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    action: 'togglePause',
    key: ' ',
    displayKey: 'Space',
    label: 'Play / Pause simulation',
    group: 'playback',
  },
  {
    action: 'speed1x',
    key: '1',
    displayKey: '1',
    label: 'Set playback speed to 1x',
    group: 'playback',
  },
  {
    action: 'speed3x',
    key: '2',
    displayKey: '2',
    label: 'Set playback speed to 3x',
    group: 'playback',
  },
  {
    action: 'speed8x',
    key: '3',
    displayKey: '3',
    label: 'Set playback speed to 8x',
    group: 'playback',
  },
  {
    action: 'reset',
    key: 'r',
    displayKey: 'R',
    label: 'Reset simulation with new seed',
    group: 'playback',
  },
  {
    action: 'burst',
    key: 'b',
    displayKey: 'B',
    label: 'Spawn +12 burst passengers',
    group: 'controls',
  },
  {
    action: 'toggleHeatmap',
    key: 'h',
    displayKey: 'H',
    label: 'Toggle floor wait-time heatmap',
    group: 'controls',
  },
  {
    action: 'toggleFireAlarm',
    key: 'f',
    displayKey: 'F',
    label: 'Toggle Phase I fire alarm',
    group: 'controls',
  },
  {
    action: 'openMetrics',
    key: 'm',
    displayKey: 'M',
    label: 'Open Live Telemetry modal',
    group: 'views',
  },
  {
    action: 'openGuide',
    key: 'g',
    displayKey: 'G',
    label: 'Open Dispatch Algorithms Guide',
    group: 'views',
  },
  {
    action: 'openShortcuts',
    key: '?',
    displayKey: '?',
    label: 'Open Keyboard Shortcuts',
    group: 'views',
  },
];

export const SHORTCUT_BY_KEY: ReadonlyMap<string, ShortcutDefinition> = new Map(
  SHORTCUT_DEFINITIONS.map((def) => [def.key, def])
);
