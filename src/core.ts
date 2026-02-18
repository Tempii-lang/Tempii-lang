/**
 * LearnSphere core engine.
 *
 * Deterministic, topology-driven mastery engine with strict separation between
 * stateful cognitive computation and passive visual surfaces.
 */

export type SignalChannel = 'reading' | 'visual' | 'kinesthetic' | 'auditory';

export const RVKA_ORDER: readonly SignalChannel[] = [
  'reading',
  'visual',
  'kinesthetic',
  'auditory',
] as const;

export type Mode = 'assessment' | 'sandbox';

export interface SkillNode {
  id: string;
  label: string;
  universeId: string;
  baseDifficulty: number;
}

export interface SkillEdge {
  from: string;
  to: string;
  dependencyWeight: number;
}

export interface DifficultyArc {
  skillId: string;
  level: number;
  complexityWeight: number;
}

export interface Universe {
  id: string;
  label: string;
  skillGraph: {
    nodes: SkillNode[];
    edges: SkillEdge[];
    arcs: DifficultyArc[];
  };
  masteryThreshold: number;
}

export interface SignalEnvelope {
  channel: SignalChannel;
  observedAt: number;
  value: number;
  reasoningQuality: number;
  transferEvidence: number;
  misconceptionTag?: string;
}

export interface SkillState {
  skillId: string;
  stability: number;
  transfer: number;
  momentum: number;
  reasoningQuality: number;
  recencyWeight: number;
  fragility: number;
  misconceptionCounts: Record<string, number>;
  lastUpdatedAt: number;
  masteryScore: number;
}

export interface LearnerProfile {
  learnerId: string;
  mode: Mode;
  skillStates: Record<string, SkillState>;
  timeline: Array<{ skillId: string; timestamp: number; masteryScore: number }>;
}

export interface EngineState {
  universes: Record<string, Universe>;
  learners: Record<string, LearnerProfile>;
}

export interface AssessmentEvent {
  learnerId: string;
  universeId: string;
  skillId: string;
  expectedNextChannel: SignalChannel;
  signal: SignalEnvelope;
}

const clamp = (n: number, min = 0, max = 1): number => Math.max(min, Math.min(max, n));

const emptySkillState = (skillId: string): SkillState => ({
  skillId,
  stability: 0,
  transfer: 0,
  momentum: 0,
  reasoningQuality: 0,
  recencyWeight: 0,
  fragility: 1,
  misconceptionCounts: {},
  lastUpdatedAt: 0,
  masteryScore: 0,
});

/**
 * Core deterministic mastery engine.
 */
export class LearnSphereEngine {
  private state: EngineState = {
    universes: {},
    learners: {},
  };

  registerUniverse(universe: Universe): void {
    this.state.universes[universe.id] = universe;
  }

  ensureLearner(learnerId: string, mode: Mode = 'assessment'): void {
    if (!this.state.learners[learnerId]) {
      this.state.learners[learnerId] = {
        learnerId,
        mode,
        skillStates: {},
        timeline: [],
      };
    }
  }

  setMode(learnerId: string, mode: Mode): void {
    this.ensureLearner(learnerId);
    this.state.learners[learnerId].mode = mode;
  }

  /**
   * Selects the next lawful channel according to strict RVKA ordering.
   */
  selectNextChannel(previousChannel?: SignalChannel): SignalChannel {
    if (!previousChannel) {
      return RVKA_ORDER[0];
    }

    const index = RVKA_ORDER.indexOf(previousChannel);
    if (index < 0 || index === RVKA_ORDER.length - 1) {
      return RVKA_ORDER[0];
    }

    return RVKA_ORDER[index + 1];
  }

  /**
   * Applies a lawful assessment event. In sandbox mode, state is not mutated.
   */
  applyAssessmentEvent(event: AssessmentEvent): LearnerProfile {
    const learner = this.getLearner(event.learnerId);
    if (learner.mode === 'sandbox') {
      return learner;
    }

    if (event.signal.channel !== event.expectedNextChannel) {
      throw new Error(
        `RVKA contract violation: expected ${event.expectedNextChannel}, got ${event.signal.channel}`,
      );
    }

    const universe = this.state.universes[event.universeId];
    if (!universe) {
      throw new Error(`Universe ${event.universeId} is not registered`);
    }

    const previous = learner.skillStates[event.skillId] ?? emptySkillState(event.skillId);
    const next = this.transitionSkillState(previous, event.signal);

    learner.skillStates[event.skillId] = next;
    learner.timeline.push({
      skillId: event.skillId,
      timestamp: event.signal.observedAt,
      masteryScore: next.masteryScore,
    });

    return learner;
  }

  getLearner(learnerId: string): LearnerProfile {
    this.ensureLearner(learnerId);
    return this.state.learners[learnerId];
  }

  snapshot(): EngineState {
    return JSON.parse(JSON.stringify(this.state));
  }

  private transitionSkillState(previous: SkillState, signal: SignalEnvelope): SkillState {
    const elapsedDays = previous.lastUpdatedAt
      ? Math.max(0, (signal.observedAt - previous.lastUpdatedAt) / (1000 * 60 * 60 * 24))
      : 0;
    const decay = clamp(1 - elapsedDays * 0.03, 0.5, 1);

    const recencyWeight = clamp(0.7 * previous.recencyWeight * decay + 0.3 * 1);
    const stability = clamp(0.65 * previous.stability * decay + 0.35 * signal.value);
    const transfer = clamp(0.7 * previous.transfer * decay + 0.3 * signal.transferEvidence);
    const reasoningQuality = clamp(
      0.6 * previous.reasoningQuality * decay + 0.4 * signal.reasoningQuality,
    );

    const momentumDelta = signal.value - previous.stability;
    const momentum = clamp(0.75 * previous.momentum * decay + 0.25 * ((momentumDelta + 1) / 2));

    const misconceptionCounts = { ...previous.misconceptionCounts };
    if (signal.misconceptionTag) {
      misconceptionCounts[signal.misconceptionTag] =
        (misconceptionCounts[signal.misconceptionTag] ?? 0) + 1;
    }

    let misconceptionPressure = 0;
    for (const tag in misconceptionCounts) {
      const count = misconceptionCounts[tag];
      misconceptionPressure += Math.min(0.25, count * 0.03);
    }

    const fragility = clamp(1 - (0.5 * stability + 0.2 * transfer + 0.3 * reasoningQuality));
    const penalizedFragility = clamp(fragility + misconceptionPressure * 0.2);

    const masteryScore = clamp(
      0.28 * stability +
        0.22 * transfer +
        0.18 * momentum +
        0.2 * reasoningQuality +
        0.12 * recencyWeight -
        0.18 * penalizedFragility,
    );

    return {
      skillId: previous.skillId,
      stability,
      transfer,
      momentum,
      reasoningQuality,
      recencyWeight,
      fragility: penalizedFragility,
      misconceptionCounts,
      lastUpdatedAt: signal.observedAt,
      masteryScore,
    };
  }
}

export const coreFunction = (): LearnSphereEngine => new LearnSphereEngine();
