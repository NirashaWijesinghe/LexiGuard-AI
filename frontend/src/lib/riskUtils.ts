import { DocumentMeta } from "./api";

export type RiskTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "SAFE" | "NON_CONTRACT";

/**
 * Calculates the exact standardized risk tier from score and risk_level.
 * Rubric:
 * - 85 - 100: CRITICAL
 * - 65 - 84:  HIGH
 * - 35 - 64:  MEDIUM
 * - 15 - 34:  LOW
 * - 0  - 14:  SAFE
 */
export function getRiskTier(
  score: number | null | undefined,
  level?: string | null,
  isNonContract?: boolean
): RiskTier {
  if (isNonContract || (level && level.toUpperCase() === "NON_CONTRACT")) {
    return "NON_CONTRACT";
  }

  const upperLevel = (level || "").toUpperCase();
  if (upperLevel === "CRITICAL") return "CRITICAL";

  if (score !== null && score !== undefined) {
    if (score >= 85) return "CRITICAL";
    if (score >= 65) return "HIGH";
    if (score >= 35) return "MEDIUM";
    if (score >= 15) return "LOW";
    return "SAFE";
  }

  if (upperLevel === "HIGH") return "HIGH";
  if (upperLevel === "MEDIUM") return "MEDIUM";
  if (upperLevel === "LOW") return "LOW";
  return "SAFE";
}

export function isHighRiskDoc(doc: DocumentMeta): boolean {
  if (doc.is_legal_contract === false || doc.risk_level === "NON_CONTRACT") return false;
  const tier = getRiskTier(doc.risk_score, doc.risk_level, false);
  return tier === "HIGH" || tier === "CRITICAL";
}

export function isMedRiskDoc(doc: DocumentMeta): boolean {
  if (doc.is_legal_contract === false || doc.risk_level === "NON_CONTRACT") return false;
  const tier = getRiskTier(doc.risk_score, doc.risk_level, false);
  return tier === "MEDIUM";
}

export function isSafeDoc(doc: DocumentMeta): boolean {
  if (doc.is_legal_contract === false || doc.risk_level === "NON_CONTRACT") return false;
  const tier = getRiskTier(doc.risk_score, doc.risk_level, false);
  return tier === "LOW" || tier === "SAFE";
}

/**
 * Returns consistent Tailwind CSS classes for badges, cards, and borders.
 */
export function getRiskBadgeClasses(tier: RiskTier) {
  switch (tier) {
    case "NON_CONTRACT":
      return {
        bg: "bg-sky-50 dark:bg-sky-500/15",
        text: "text-sky-700 dark:text-sky-400",
        border: "border-sky-200 dark:border-sky-500/30",
        pillClass: "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/30",
        dotColor: "bg-sky-500"
      };
    case "CRITICAL":
    case "HIGH":
      return {
        bg: "bg-rose-50 dark:bg-rose-500/15",
        text: "text-rose-700 dark:text-rose-400",
        border: "border-rose-200 dark:border-rose-500/30",
        pillClass: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30",
        dotColor: "bg-rose-500"
      };
    case "MEDIUM":
      return {
        bg: "bg-amber-50 dark:bg-amber-500/15",
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-200 dark:border-amber-500/30",
        pillClass: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
        dotColor: "bg-amber-500"
      };
    case "LOW":
    case "SAFE":
    default:
      return {
        bg: "bg-emerald-50 dark:bg-emerald-500/15",
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-200 dark:border-emerald-500/30",
        pillClass: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
        dotColor: "bg-emerald-500"
      };
  }
}
