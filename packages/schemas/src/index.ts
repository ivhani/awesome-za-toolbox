export type CurrencyCode = "ZAR";

export interface StatementPeriod {
  from: string;
  to: string;
}

export interface BankTransaction {
  date: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  balance?: number;
  reference?: string;
}

export interface BankStatement {
  institution: string;
  accountNumberMasked?: string;
  period: StatementPeriod;
  openingBalance?: number;
  closingBalance?: number;
  transactions: BankTransaction[];
}

export interface MunicipalLineItem {
  date: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  reference?: string;
}

export interface MunicipalStatement {
  municipality: string;
  accountNumber?: string;
  billingPeriod: StatementPeriod;
  openingBalance?: number;
  closingBalance?: number;
  charges: MunicipalLineItem[];
  payments: MunicipalLineItem[];
}
