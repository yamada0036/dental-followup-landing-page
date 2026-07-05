const BUSINESS_DAYS_PER_MONTH = 22;
const MISSED_CALL_BOOKING_OPPORTUNITY_RATE = 0.25;

const missedCallRates = {
  less_than_5: 0.03,
  five_to_ten: 0.075,
  ten_to_twenty: 0.15,
  more_than_twenty: 0.25,
  unknown: 0.10
};

const missedCallFollowupRates = {
  almost_all: 0.90,
  more_than_half: 0.65,
  less_than_half: 0.35,
  rarely: 0.10,
  unknown: 0.50
};

const unscheduledExposureFactors = {
  consistent: 0.10,
  occasional: 0.25,
  staff_time: 0.40,
  no_process: 0.55,
  unknown: 0.30
};

const recallExposureFactors = {
  consistent: 0.10,
  partial: 0.30,
  no: 0.50,
  unknown: 0.30
};

const missedRateScores = { less_than_5: 10, five_to_ten: 25, ten_to_twenty: 50, more_than_twenty: 75, unknown: 35 };
const missedFollowupGapScores = { almost_all: 5, more_than_half: 15, less_than_half: 30, rarely: 50, unknown: 25 };
const treatmentScores = { consistent: 15, occasional: 40, staff_time: 70, no_process: 90, unknown: 50 };
const recallScores = { consistent: 15, partial: 55, no: 90, unknown: 50 };

const numericLimits = {
  daily_calls: { min: 1, max: 1000, integer: false },
  average_new_patient_value: { min: 1, max: 100000, integer: false },
  unscheduled_treatment_value: { min: 1, max: 10000000, integer: false },
  unscheduled_patient_count: { min: 1, max: 100000, integer: true },
  average_treatment_value: { min: 1, max: 1000000, integer: false },
  overdue_recall_count: { min: 1, max: 100000, integer: true },
  average_recall_value: { min: 1, max: 10000, integer: false }
};

function parseNumber(payload, key, required = true) {
  const raw = payload[key];
  if ((raw === undefined || raw === null || raw === '') && !required) return null;
  const value = Number(raw);
  const limit = numericLimits[key];
  if (!limit || !Number.isFinite(value) || value < limit.min || value > limit.max) {
    throw new Error(`Invalid calculator field: ${key}`);
  }
  return limit.integer ? Math.round(value) : value;
}

function parseEnum(payload, key, allowed) {
  const value = String(payload[key] || '').trim();
  if (!Object.prototype.hasOwnProperty.call(allowed, value)) {
    throw new Error(`Invalid calculator field: ${key}`);
  }
  return value;
}

function normalizeCalculatorInputs(payload) {
  const knowsUnscheduledValue = parseEnum(payload, 'knows_unscheduled_value', { yes: true, no: true, unknown: true });
  const inputs = {
    daily_calls: parseNumber(payload, 'daily_calls'),
    missed_call_rate: parseEnum(payload, 'missed_call_rate', missedCallRates),
    missed_call_followup_rate: parseEnum(payload, 'missed_call_followup_rate', missedCallFollowupRates),
    average_new_patient_value: parseNumber(payload, 'average_new_patient_value'),
    knows_unscheduled_value: knowsUnscheduledValue,
    unscheduled_treatment_value: null,
    unscheduled_patient_count: null,
    average_treatment_value: null,
    unscheduled_followup_process: parseEnum(payload, 'unscheduled_followup_process', unscheduledExposureFactors),
    overdue_recall_count: parseNumber(payload, 'overdue_recall_count'),
    average_recall_value: parseNumber(payload, 'average_recall_value'),
    recall_workflow_status: parseEnum(payload, 'recall_workflow_status', recallExposureFactors)
  };

  if (knowsUnscheduledValue === 'yes') {
    inputs.unscheduled_treatment_value = parseNumber(payload, 'unscheduled_treatment_value');
  } else {
    inputs.unscheduled_patient_count = parseNumber(payload, 'unscheduled_patient_count');
    inputs.average_treatment_value = parseNumber(payload, 'average_treatment_value');
  }

  return inputs;
}

function baseUnscheduledValue(inputs) {
  if (inputs.knows_unscheduled_value === 'yes') return inputs.unscheduled_treatment_value;
  return inputs.unscheduled_patient_count * inputs.average_treatment_value;
}

function calculateResults(inputs) {
  const monthlyCalls = inputs.daily_calls * BUSINESS_DAYS_PER_MONTH;
  const estimatedMissedCalls = monthlyCalls * missedCallRates[inputs.missed_call_rate];
  const unfollowedMissedCalls = estimatedMissedCalls * (1 - missedCallFollowupRates[inputs.missed_call_followup_rate]);
  const missedCallOpportunity = unfollowedMissedCalls * MISSED_CALL_BOOKING_OPPORTUNITY_RATE * inputs.average_new_patient_value;
  const unscheduledTreatmentOpportunity = baseUnscheduledValue(inputs) * unscheduledExposureFactors[inputs.unscheduled_followup_process];
  const recallOpportunity = inputs.overdue_recall_count * inputs.average_recall_value * recallExposureFactors[inputs.recall_workflow_status];

  const missedCallScore = Math.min(100, missedRateScores[inputs.missed_call_rate] + missedFollowupGapScores[inputs.missed_call_followup_rate]);
  const treatmentValue = baseUnscheduledValue(inputs);
  const treatmentModifier = treatmentValue > 500000 ? 15 : treatmentValue >= 150000 ? 10 : treatmentValue >= 50000 ? 5 : 0;
  const unscheduledTreatmentScore = Math.min(100, treatmentScores[inputs.unscheduled_followup_process] + treatmentModifier);
  const recallModifier = inputs.overdue_recall_count > 1000 ? 15 : inputs.overdue_recall_count >= 300 ? 10 : inputs.overdue_recall_count >= 100 ? 5 : 0;
  const recallScore = Math.min(100, recallScores[inputs.recall_workflow_status] + recallModifier);

  const max = Math.max(unscheduledTreatmentScore, missedCallScore, recallScore);
  const largestLeak = unscheduledTreatmentScore === max ? 'unscheduled_treatment' : missedCallScore === max ? 'missed_calls' : 'overdue_recall';

  return {
    missed_call_opportunity: Math.round(missedCallOpportunity),
    unscheduled_treatment_opportunity: Math.round(unscheduledTreatmentOpportunity),
    recall_opportunity: Math.round(recallOpportunity),
    missed_call_score: missedCallScore,
    unscheduled_treatment_score: unscheduledTreatmentScore,
    recall_score: recallScore,
    largest_leak: largestLeak
  };
}

module.exports = {
  normalizeCalculatorInputs,
  calculateResults
};
