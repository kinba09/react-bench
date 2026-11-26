export type Level = 1 | 2 | 3 | 4 | 5;
export type DynamicTrackingLevel = 1 | 2 | 3 | 4 | 5;
export type Category = 'visual-reaction' | 'target-acquisition' | 'dynamic-tracking' | 'inhibitory-control';
export type TargetSymbol = 'triangle' | 'circle' | 'square' | 'diamond' | 'star' | 'cross' | 'hexagon' | 'crescent' | 'heart' | 'flower';
export type Outcome = 'success' | 'premature' | 'wrong' | 'expired';
export type InhibitoryControlCondition = 'go' | 'no-go';
export type InhibitoryControlOutcome = 'go-response' | 'go-omission' | 'go-wrong-click' | 'go-premature-click' | 'forbidden-click' | 'withheld';

interface SharedConfig {
  seed: string;
  levels: Level[];
  trialsPerLevel: number;
  screenshotsPerSecond: number;
}
export interface VisualReactionConfig extends SharedConfig {
  category: 'visual-reaction';
  initialDelayMs: [number, number];
  responseWindowsMs: [number, number, number, number, number];
}
export interface TargetAcquisitionConfig extends SharedConfig {
  category: 'target-acquisition';
  initialDelayMs?: [number, number];
}
export interface DynamicTrackingConfig extends SharedConfig {
  category: 'dynamic-tracking';
  levels: DynamicTrackingLevel[];
  clickWindowMs: number;
  initialDelayMs?: [number, number];
}
export interface InhibitoryControlConfig extends SharedConfig {
  category: 'inhibitory-control';
  initialDelayMs: [number, number];
  responseWindowsMs: [number, number, number, number, number];
}
export type BenchmarkConfig = VisualReactionConfig | TargetAcquisitionConfig | DynamicTrackingConfig | InhibitoryControlConfig;

interface SharedScenario {
  id: string;
  seed: string;
  level: Level;
  repetition: number;
  responseWindowMs: number;
}
export interface VisualReactionScenario extends SharedScenario {
  category: 'visual-reaction';
  initialDelayMs: number;
  target: { u: number; v: number; radius: number };
}
export interface TargetAcquisitionScenario extends SharedScenario {
  category: 'target-acquisition';
  initialDelayMs: number;
  objectSizePx: 26;
  reference: { symbol: TargetSymbol };
  objects: { id: string; u: number; v: number; symbol: TargetSymbol; matching: boolean }[];
}
export interface MovingObject {
  id: string;
  role: 'required' | 'distractor';
  u: number;
  v: number;
  velocityX: number;
  velocityY: number;
  radius: number;
}
export interface DynamicTrackingScenario {
  id: string;
  category: 'dynamic-tracking';
  seed: string;
  level: DynamicTrackingLevel;
  repetition: number;
  clickWindowMs: number;
  initialDelayMs: number;
  watchDurationMs: number;
  hiddenDurationMs: number;
  requiredTargetId: string;
  objects: MovingObject[];
}
export interface InhibitoryControlScenario extends SharedScenario {
  category: 'inhibitory-control';
  initialDelayMs: number;
  condition: InhibitoryControlCondition;
  target: { u: number; v: number; radius: number };
}
export type Scenario = VisualReactionScenario | TargetAcquisitionScenario | DynamicTrackingScenario | InhibitoryControlScenario;
export interface AcquisitionObjectState { id: string; x: number; y: number; radius: number; symbol: TargetSymbol; matching: boolean }

export type TrialPhase = 'prepared' | 'waiting' | 'watching' | 'hidden' | 'active' | 'complete';
export type BrowserEventType = 'prepared' | 'started' | 'phase-transition' | 'activated' | 'action-registered' | 'expired';
export interface MovingTargetState {
  id: string;
  role: MovingObject['role'];
  x: number;
  y: number;
  radius: number;
}
export interface BrowserEvent {
  trialId: string;
  type: BrowserEventType;
  atMs: number;
  clock: 'browser-performance';
  phase: TrialPhase;
  plannedActivationAtMs?: number;
  phaseDeadlineAtMs?: number;
  deadlineAtMs?: number;
  x?: number;
  y?: number;
  hit?: boolean;
  objectIndex?: number;
  inputTrusted?: boolean;
  objects?: MovingTargetState[];
  requiredTargetId?: string;
  clickedObjectId?: string | null;
}
export interface SceneSnapshot {
  trialId: string;
  phase: TrialPhase;
  nowMs: number;
  target: { x: number; y: number; radius: number };
  objects: (AcquisitionObjectState | MovingTargetState)[];
  requiredTargetId?: string;
  reference: { symbol: TargetSymbol } | null;
  condition?: InhibitoryControlCondition;
  events: BrowserEvent[];
}
export interface ObservationRecord {
  id: string;
  clock: 'runner-performance';
  requestedAtMs: number;
  returnedAtMs: number;
  exactCaptureAtMs: null;
  byteLength: number;
  deliveries: number[];
}
export interface Observation {
  id: string;
  image: Uint8Array;
  mimeType: 'image/png';
  width: 1280;
  height: 720;
}
export interface ActionRecord {
  id: string;
  observationId: string | null;
  type: 'click';
  x: number;
  y: number;
  submittedAtMs: number;
  decisionCompletedAtMs: null;
  dispatchedAtMs: number;
  returnedAtMs: number | null;
  clock: 'runner-performance';
}
export interface VisualContext {
  trialId: string;
  instructions: string;
  signal: AbortSignal;
  observe(): Observation | null;
  input: { click(x: number, y: number, observationId?: string): Promise<void> };
}
export interface OracleContext extends VisualContext {
  oracle: { snapshot(): Promise<SceneSnapshot> };
}
export interface AgentMetadata {
  name: string;
  model: string | null;
  adapterVersion?: string | null;
  access: 'privileged-oracle' | 'visual';
}
export interface VisualAdapter {
  metadata: AgentMetadata & { access: 'visual' };
  prepare(context: VisualContext): Promise<void>;
  run(context: VisualContext): Promise<void>;
}
export interface PrivilegedAdapter {
  metadata: AgentMetadata & { access: 'privileged-oracle' };
  prepare(context: OracleContext): Promise<void>;
  run(context: OracleContext): Promise<void>;
}
export type AgentAdapter = VisualAdapter | PrivilegedAdapter;
export interface TrialResult {
  id: string;
  scenario: Scenario;
  outcome: Outcome;
  conditionOutcome?: InhibitoryControlOutcome;
  events: BrowserEvent[];
  observations: ObservationRecord[];
  actions: ActionRecord[];
  timing: {
    preparationMs: number;
    reactionLatencyMs: number | null;
    modelProcessingMs: null;
    measuredCaptureHz: number | null;
    browserTimeOriginMs: number;
    runnerClock: 'runner-performance';
    reactionClock: 'browser-performance';
    measurement: 'software-activation-to-input-handler';
  };
}
export interface RunSummary {
  category: Category;
  total: number;
  correct: number;
  completionRate: number;
  medianReactionLatencyMs: number | null;
  p95: { value: null; status: 'insufficient-samples' };
  failures: Record<Exclude<Outcome, 'success'>, number>;
  inhibitoryControl?: {
    byCondition: { condition: InhibitoryControlCondition; total: number; correct: number; medianReactionLatencyMs: number | null }[];
    byLevel: { level: Level; byCondition: { condition: InhibitoryControlCondition; total: number; correct: number; medianReactionLatencyMs: number | null }[] }[];
    outcomes: Record<InhibitoryControlOutcome, number>;
  };
  byLevel: { level: Level; total: number; correct: number; medianReactionLatencyMs: number | null; objectsPerTrial: number | null }[];
}
export interface RunReport {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  category: Category;
  benchmark: { name: 'reactbench'; version: string; playwrightVersion: string; gitCommit: string | null; trackedChanges: boolean | null };
  comparisonClass: 'control-only' | 'visual';
  agent: AgentMetadata;
  config: BenchmarkConfig;
  environment: {
    viewport: { width: 1280; height: 720 };
    deviceScaleFactor: 1;
    browser: string;
    browserVersion: string;
    headless: boolean;
    nodeVersion: string;
    platform: string;
    architecture: string;
    cpu: string;
    cpuCount: number;
    memoryBytes: number;
    actionInterface: 'playwright-mouse';
    targetRadiusPx: number;
    acquisitionObjectSizePx: number;
    movementSpeedPxPerSecond: number | null;
  };
  summary: RunSummary;
  trials: TrialResult[];
}

export interface BrowserEnvironment {
  prepare(scenario: Scenario, index: number, total: number): SceneSnapshot;
  start(): void;
  snapshot(): SceneSnapshot;
}
declare global {
  interface Window { reactBenchEnvironment: BrowserEnvironment }
}
