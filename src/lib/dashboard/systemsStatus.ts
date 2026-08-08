export type SystemHealth = 'operational' | 'degraded' | 'maintenance';

export type SystemStatusRow = {
  id: string;
  label: string;
  health: SystemHealth;
};

/** Curriculum-themed fictional systems — decorative training atmosphere only. */
const TRAINING_SYSTEMS = [
  { id: 'auth-gateway', label: 'Auth Gateway' },
  { id: 'lab-broker', label: 'Lab Broker' },
  { id: 'evidence-store', label: 'Evidence Store' },
  { id: 'ticket-router', label: 'Ticket Router' },
  { id: 'score-pipeline', label: 'Score Pipeline' },
] as const;

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable-per-day systems status seeded from student id + UTC date.
 * Changes once per day; not real monitoring.
 */
export function getSystemsStatus(
  studentId: string,
  now: Date = new Date()
): SystemStatusRow[] {
  const dayKey = now.toISOString().slice(0, 10);
  const seed = hashSeed(`${studentId}:${dayKey}`);

  // Pick 0–1 non-green systems for light variety without chaos.
  const anomalyCount = seed % 5 === 0 ? 1 : 0;
  const anomalyIndex = anomalyCount > 0 ? seed % TRAINING_SYSTEMS.length : -1;
  const anomalyHealth: SystemHealth =
    (seed >>> 8) % 2 === 0 ? 'degraded' : 'maintenance';

  return TRAINING_SYSTEMS.map((system, index) => ({
    id: system.id,
    label: system.label,
    health: index === anomalyIndex ? anomalyHealth : 'operational',
  }));
}
