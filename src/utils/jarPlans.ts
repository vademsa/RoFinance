import type { Jar, JarCarryover, JarPlanSnapshot, Transaction } from '../types';
import { DEFAULT_JARS } from '../constants/defaultData';
import type { JarPlanDefinition } from '../constants/jarPlans';
import {
  applyCurrentCycleSpending,
  getClosingCarryovers,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  normalizeJarBudgetState,
} from './monthlyCycle';

const cloneJars = (jars: Jar[]) => JSON.parse(JSON.stringify(jars)) as Jar[];

export function getJarConfigurationSignature(jars: Jar[]) {
  return JSON.stringify(jars.map((jar) => ({
    code: jar.code,
    name: jar.name,
    percentage: jar.percentage,
    bankCode: jar.bankCode,
    bankName: jar.bankName,
    accountNumber: jar.accountNumber,
    accountName: jar.accountName,
    color: jar.color,
    description: jar.description,
  })).sort((a, b) => a.code.localeCompare(b.code)));
}

export function createJarPlanSnapshot(
  jars: Jar[],
  sourcePlanId: string,
  name: string,
  now = new Date(),
): JarPlanSnapshot {
  const timestamp = now.toISOString();
  return {
    id: `jar-plan-${timestamp.replace(/[^0-9]/g, '')}`,
    name,
    sourcePlanId,
    jars: cloneJars(jars),
    createdAt: timestamp,
  };
}

export function allocateWholeUnits(total: number, weights: number[]) {
  const safeTotal = Math.max(0, Math.round(total));
  if (weights.length === 0) return [];
  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = safeWeights.map((weight) =>
    weightTotal > 0 ? (safeTotal * weight) / weightTotal : safeTotal / weights.length
  );
  const result = exact.map(Math.floor);
  let remainder = safeTotal - result.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) {
    result[order[index % order.length].index] += 1;
  }
  return result;
}

export function restoreMissingJarPercentages(
  jars: Jar[],
  referenceWeights: { code: string; weight: number }[],
) {
  const currentTotal = jars.reduce((total, jar) => total + Math.max(0, jar.percentage || 0), 0);
  if (currentTotal > 0.01 || jars.length === 0) return { jars, changed: false };
  const weightsByCode = new Map(referenceWeights.map((item) => [item.code, item.weight]));
  if (jars.some((jar) => !weightsByCode.has(jar.code))) return { jars, changed: false };
  const weights = jars.map((jar) => Math.max(0, weightsByCode.get(jar.code) || 0));
  if (weights.reduce((total, weight) => total + weight, 0) <= 0) {
    return { jars, changed: false };
  }
  const percentageUnits = allocateWholeUnits(10_000, weights);
  return {
    jars: jars.map((jar, index) => ({ ...jar, percentage: percentageUnits[index] / 100 })),
    changed: true,
  };
}

function takeLots(pool: JarCarryover[], amount: number) {
  const taken: JarCarryover[] = [];
  let remaining = amount;
  while (remaining > 0 && pool.length > 0) {
    const source = pool[0];
    const portion = Math.min(source.amount, remaining);
    taken.push({ ...source, amount: portion });
    remaining -= portion;
    if (portion === source.amount) pool.shift();
    else pool[0] = { ...source, amount: source.amount - portion };
  }
  return taken;
}

export interface SwitchJarPlanInput {
  currentJars: Jar[];
  archivedJars: Jar[];
  targetPlan?: JarPlanDefinition;
  targetSnapshot?: JarPlanSnapshot;
  transactions: Transaction[];
  resetDay: number;
  now?: Date;
}

export function switchJarPlan(input: SwitchJarPlanInput) {
  const now = input.now || new Date();
  const current = applyCurrentCycleSpending(
    input.currentJars.map(normalizeJarBudgetState),
    input.transactions,
    input.resetDay,
    now,
  );
  const targetConfigs = input.targetSnapshot
    ? input.targetSnapshot.jars.map((jar) => ({ code: jar.code, percentage: jar.percentage, snapshotJar: jar }))
    : (input.targetPlan?.allocations || []).map((allocation) => ({ ...allocation, snapshotJar: undefined }));
  if (targetConfigs.length === 0) throw new Error('Mẫu phân bổ không có hũ hợp lệ.');

  const targetCodes = new Set(targetConfigs.map((item) => item.code));
  const removed = current.filter((jar) => !targetCodes.has(jar.code));
  const retainedByCode = new Map(current.map((jar) => [jar.code, jar]));
  const archivedByCode = new Map<string, Jar>();
  [...input.archivedJars, ...removed].forEach((jar) => archivedByCode.set(jar.code, jar));
  const occupiedIds = new Set([...current, ...input.archivedJars].map((jar) => jar.id));

  const cycleStart = getFinancialCycleStart(now, input.resetDay);
  const cycleEnd = getNextFinancialCycleStart(cycleStart, input.resetDay);
  const transferPool = removed.flatMap((jar) =>
    getClosingCarryovers(jar, cycleStart, cycleEnd, jar.currentSpent).map((lot) => ({
      ...lot,
      sourceJarId: lot.sourceJarId || jar.id,
      sourceJarCode: lot.sourceJarCode || jar.code,
      sourceJarName: lot.sourceJarName || jar.name,
    }))
  );
  const transferredAmount = transferPool.reduce((sum, lot) => sum + lot.amount, 0);

  const nextJars = targetConfigs.map((config, index) => {
    const retained = retainedByCode.get(config.code);
    if (retained) {
      const restoredConfig = config.snapshotJar;
      return {
        ...retained,
        ...(restoredConfig ? {
          name: restoredConfig.name,
          bankName: restoredConfig.bankName,
          bankCode: restoredConfig.bankCode,
          accountNumber: restoredConfig.accountNumber,
          accountName: restoredConfig.accountName,
          color: restoredConfig.color,
          description: restoredConfig.description,
        } : {}),
        percentage: config.percentage,
      };
    }
    const saved = config.snapshotJar || archivedByCode.get(config.code)
      || DEFAULT_JARS.find((jar) => jar.code === config.code);
    if (!saved) throw new Error(`Không tìm thấy cấu hình hũ ${config.code}.`);
    const idBase = `jar-${String(config.code).toLowerCase()}-${now.getTime()}-${index}`;
    let id = idBase;
    let suffix = 1;
    while (occupiedIds.has(id)) id = `${idBase}-${suffix++}`;
    occupiedIds.add(id);
    return normalizeJarBudgetState({
      ...saved,
      id,
      percentage: config.percentage,
      targetBudget: 0,
      currentSpent: 0,
      cycleAllocation: 0,
      carryovers: [],
      transferredIn: [],
      lastRolloverCycleStart: undefined,
    });
  });

  const portions = allocateWholeUnits(
    transferredAmount,
    nextJars.map((jar) => jar.percentage),
  );
  const pool = transferPool.map((lot) => ({ ...lot }));
  const activeJars = nextJars.map((jar, index) => normalizeJarBudgetState({
    ...jar,
    transferredIn: [...(jar.transferredIn || []), ...takeLots(pool, portions[index])],
  }));
  const archivedJars = [...input.archivedJars, ...removed]
    .filter((jar, index, list) => list.findIndex((item) => item.id === jar.id) === index);

  return { activeJars, archivedJars, removedJars: removed, transferredAmount };
}
