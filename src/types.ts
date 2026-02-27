// SAP BTP Usage Data Management API Types

export interface CloudCreditsDetailsResponse {
  globalAccountId: string;
  globalAccountName: string;
  contracts: ContractResponse[];
}

export interface ContractResponse {
  contractStartDate: string;
  contractEndDate: string;
  currency: string;
  phases: PhaseResponse[];
}

export interface PhaseResponse {
  phaseStartDate: string;
  phaseEndDate: string;
  phaseUpdates: PhaseUpdate[];
}

export interface PhaseUpdate {
  balance: number;
  cloudCreditsForPhase: number;
  phaseUpdatedOn: string;
}

export interface MonthlyUsageResponse {
  dataCenter: string;
  dataCenterName: string;
  directoryId?: string;
  directoryName?: string;
  environmentInstanceId?: string;
  environmentInstanceName?: string;
  globalAccountId: string;
  globalAccountName: string;
  identityZone?: string;
  instanceId?: string;
  measureId: string;
  metricName: string;
  plan: string;
  planName: string;
  reportYearMonth: number;
  serviceId: string;
  serviceName: string;
  spaceId?: string;
  spaceName?: string;
  subaccountId: string;
  subaccountName: string;
  unitPlural: string;
  unitSingular: string;
  usage: number;
  application?: string;
  startIsoDate?: string;
  endIsoDate?: string;
}

export interface MonthlyCostResponse {
  cost: number;
  crmSku?: string;
  currency: string;
  dataCenter: string;
  dataCenterName: string;
  directoryId?: string;
  directoryName?: string;
  estimated: boolean;
  globalAccountId: string;
  globalAccountName: string;
  measureId: string;
  metricName: string;
  plan: string;
  planName: string;
  reportYearMonth: number;
  serviceId: string;
  serviceName: string;
  subaccountId: string;
  subaccountName: string;
  unitPlural: string;
  unitSingular: string;
  usage: number;
  quota?: number;
  actualUsage?: number;
  chargedBlocks?: number;
  paygCost?: number;
  cloudCreditsCost?: number;
  startIsoDate?: string;
  endIsoDate?: string;
}

export interface SubaccountUsageResponse {
  categoryId?: number;
  categoryName?: string;
  dataCenter: string;
  dataCenterName: string;
  directoryId?: string;
  directoryName?: string;
  environmentInstanceId?: string;
  environmentInstanceName?: string;
  globalAccountId: string;
  globalAccountName: string;
  identityZone?: string;
  instanceId?: string;
  measureId: string;
  metricName: string;
  periodEndDate: number;
  periodStartDate: number;
  plan: string;
  planName: string;
  serviceId: string;
  serviceName: string;
  spaceId?: string;
  spaceName?: string;
  subaccountId: string;
  subaccountName: string;
  unitPlural: string;
  unitSingular: string;
  usage: number;
  application?: string;
  startIsoDate?: string;
  endIsoDate?: string;
}

// Aggregated types for analysis
export interface ServiceCostSummary {
  serviceName: string;
  serviceId: string;
  totalCost: number;
  totalUsage: number;
  currency: string;
  metricName: string;
  unitPlural: string;
  subaccounts: string[];
  hasOverusage: boolean;
  paygCost: number;
}

export interface MonthlyComparison {
  month: number;
  monthLabel: string;
  totalCost: number;
  totalUsage: number;
  serviceBreakdown: {
    serviceName: string;
    cost: number;
    usage: number;
  }[];
}

export interface OverusageItem {
  serviceName: string;
  planName: string;
  subaccountName: string;
  quota: number;
  actualUsage: number;
  overusageAmount: number;
  paygCost: number;
  reportYearMonth: number;
}
