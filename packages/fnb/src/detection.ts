export const FNB_STATEMENT_FAMILIES = [
  "personal-current-account",
  "business-account",
  "home-loan",
  "credit-card",
] as const;

export type FnbStatementFamily = typeof FNB_STATEMENT_FAMILIES[number];

export interface FnbDetectionEvidence {
  code: string;
  count: number;
}

export interface FnbFamilyCandidate {
  family: FnbStatementFamily;
  matched: boolean;
  evidence: FnbDetectionEvidence[];
}

export interface FnbFamilyDetection {
  status: "detected" | "undetected" | "ambiguous";
  family?: FnbStatementFamily;
  candidates: FnbFamilyCandidate[];
}

interface EvidenceRule {
  code: string;
  pattern: RegExp;
}

const FAMILY_RULES: Record<FnbStatementFamily, EvidenceRule[]> = {
  "personal-current-account": [
    { code: "personal-product-account", pattern: /\bFNB\s+(?:Fusion|Premier|Private Clients|Private Wealth|Easy|Gold|Aspire)[^\n]*\bAccount\b/gi },
    { code: "current-account-label", pattern: /\b(?:Current|Cheque|Transmission) Account\b/gi },
  ],
  "business-account": [
    { code: "business-product-account", pattern: /\b(?:First\s+)?Business(?:\s+Zero)? Account\b/gi },
  ],
  "home-loan": [
    { code: "home-loan-statement", pattern: /\bHome Loan Statement\b/gi },
    { code: "home-loan-transaction-history", pattern: /\bHome Loan Transaction History from\b/gi },
  ],
  "credit-card": [
    { code: "credit-card-statement", pattern: /\b(?:FNB\s+)?Credit Card Statement\b/gi },
    { code: "credit-card-product", pattern: /\bFNB[^\n]*\bCredit Card\b/gi },
  ],
};

const GENERIC_PERSONAL_RULES: EvidenceRule[] = [
  { code: "generic-fnb-bank-statement", pattern: /\bFNB BANK STATEMENT\b/gi },
  { code: "generic-statement-period", pattern: /^(?:Statement )?Period\s*:/gim },
  { code: "generic-transactions-section", pattern: /^Transactions\s*:?\s*$/gim },
];

export function detectFnbStatementFamily(text: string): FnbFamilyDetection {
  const candidates = FNB_STATEMENT_FAMILIES.map((family) => candidateFor(family, text));
  const specificMatches = candidates.filter((candidate) => candidate.matched);

  if (specificMatches.length === 0) {
    const genericEvidence = collectEvidence(text, GENERIC_PERSONAL_RULES);
    if (genericEvidence.length === GENERIC_PERSONAL_RULES.length) {
      const personalCandidate = candidates.find((candidate) => candidate.family === "personal-current-account");
      if (personalCandidate) {
        personalCandidate.matched = true;
        personalCandidate.evidence = genericEvidence;
      }
    }
  }

  const matched = candidates.filter((candidate) => candidate.matched);
  if (matched.length === 1) {
    return { status: "detected", family: matched[0]?.family, candidates };
  }

  return {
    status: matched.length === 0 ? "undetected" : "ambiguous",
    candidates,
  };
}

function candidateFor(family: FnbStatementFamily, text: string): FnbFamilyCandidate {
  const evidence = collectEvidence(text, FAMILY_RULES[family]);
  return {
    family,
    matched: evidence.length > 0,
    evidence,
  };
}

function collectEvidence(text: string, rules: EvidenceRule[]): FnbDetectionEvidence[] {
  return rules.flatMap((rule) => {
    const count = [...text.matchAll(rule.pattern)].length;
    return count > 0 ? [{ code: rule.code, count }] : [];
  });
}
