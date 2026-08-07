import type { DiscoveryInputs, ModelResult, Params } from './types.js';
import { DEFAULT_PARAMS } from './defaults.js';
import { computeScenario } from './calc.js';
import { buildAudit } from './audit.js';
import { recommendationFor, tierFor, tierRank } from './recommend.js';
import { sensitivity } from './sensitivity.js';
import { validateDiscovery, validateParams } from './validate.js';

/**
 * The single entry point for both delivery modes.
 *
 * Takes raw, possibly dirty values. Never throws, never returns NaN or Infinity,
 * and never invents a value for a missing answer.
 */
export function runModel(
  inputs: DiscoveryInputs,
  params: Params = DEFAULT_PARAMS,
): ModelResult {
  const paramIssues = validateParams(params);
  const { issues: inputIssues, warnings, values, areaUnit } = validateDiscovery(inputs);
  const issues = [...inputIssues, ...paramIssues];

  if (issues.length > 0 || values === null) {
    return {
      status: 'model incomplete',
      current: null,
      target: null,
      sensitivity: [],
      tierCurrent: null,
      tierTarget: null,
      tierImprovesAtTarget: false,
      tierWeakensAtTarget: false,
      recommendation: null,
      audit: [],
      issues,
      warnings,
      params,
      areaUnit,
    };
  }

  const { area, resources, salary, targetArea, shiftHours, workDays } = values;

  const current = computeScenario({
    scenario: 'current',
    resources,
    salary,
    shiftHours,
    workDays,
    areaUsed: area,
    scaleFactor: 1,
    ratio: params.ratioNow,
    params,
  });

  // The target scenario scales the customer's resources linearly and swaps in the
  // at-scale operator ratio. Nothing is averaged, smoothed or interpolated between
  // the two — the contrast between linear manual cost and sub-linear autonomous
  // cost is the entire point of the second scenario.
  const scaleFactor = targetArea / area;
  const target = computeScenario({
    scenario: 'target',
    resources: resources * scaleFactor,
    salary,
    shiftHours,
    workDays,
    areaUsed: targetArea,
    scaleFactor,
    ratio: params.ratioScale,
    params,
  });

  const tierCurrent = tierFor(current.costRatio, current.paybackMonths);
  const tierTarget = tierFor(target.costRatio, target.paybackMonths);

  return {
    status: 'ok',
    current,
    target,
    // Reported for the current-area scenario, which is the basis Sheet 1 and the
    // recommendation use.
    sensitivity: sensitivity(current, params),
    tierCurrent,
    tierTarget,
    tierImprovesAtTarget: tierRank(tierTarget) > tierRank(tierCurrent),
    tierWeakensAtTarget: tierRank(tierTarget) < tierRank(tierCurrent),
    recommendation: recommendationFor(tierCurrent),
    audit: buildAudit(current, target, params, areaUnit),
    issues: [],
    warnings,
    params,
    areaUnit,
  };
}

export { DEFAULT_PARAMS, DEFAULT_DISCOVERY, SENSITIVITY_RATIOS, DEFAULT_AREA_UNIT } from './defaults.js';
export { computeScenario } from './calc.js';
export { sensitivity } from './sensitivity.js';
export { tierFor, tierRank, recommendationFor, TIER_TEXT } from './recommend.js';
export { buildAudit } from './audit.js';
export {
  normaliseHeader,
  mapHeaders,
  describeMappingFailure,
  resolveParams,
  readDiscovery,
} from './columns.js';
export type { HeaderMapping, ParamResolution, ParamSource, ResolvedParam } from './columns.js';
export { ceilCount, roundHalfUp, toCents } from './round.js';
export {
  coerceNumber,
  validateDiscovery,
  validateParams,
  normaliseUnit,
  displayUnit,
  labelFor,
} from './validate.js';
export * from './format.js';
export type * from './types.js';
