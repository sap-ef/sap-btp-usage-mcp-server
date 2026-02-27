import { z } from 'zod';

// Schema for getting cloud credits balance
export const CloudCreditsInputSchema = z.object({
  viewPhases: z.enum(['ALL', 'CURRENT'])
    .default('CURRENT')
    .describe('Show credit history: CURRENT for active phase only, ALL for complete history')
}).strict();

export type CloudCreditsInput = z.infer<typeof CloudCreditsInputSchema>;

// Schema for getting top services by cost/consumption
export const TopServicesInputSchema = z.object({
  months: z.number()
    .int()
    .min(1)
    .max(24)
    .default(3)
    .describe('Number of months to analyze (1-24)'),
  limit: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum number of services to return (1-50)'),
  sortBy: z.enum(['cost', 'usage'])
    .default('cost')
    .describe('Sort by total cost or total usage')
}).strict();

export type TopServicesInput = z.infer<typeof TopServicesInputSchema>;

// Schema for comparing monthly consumption
export const MonthlyComparisonInputSchema = z.object({
  months: z.number()
    .int()
    .min(2)
    .max(12)
    .default(3)
    .describe('Number of months to compare (2-12)'),
  serviceName: z.string()
    .optional()
    .describe('Optional: filter to a specific service name')
}).strict();

export type MonthlyComparisonInput = z.infer<typeof MonthlyComparisonInputSchema>;

// Schema for detecting overusage
export const OverusageInputSchema = z.object({
  months: z.number()
    .int()
    .min(1)
    .max(12)
    .default(3)
    .describe('Number of months to check for overusage (1-12)')
}).strict();

export type OverusageInput = z.infer<typeof OverusageInputSchema>;

// Schema for finding newly enabled services
export const NewServicesInputSchema = z.object({
  recentMonths: z.number()
    .int()
    .min(1)
    .max(6)
    .default(3)
    .describe('Consider services enabled in the last N months as "new" (1-6)'),
  comparisonMonths: z.number()
    .int()
    .min(1)
    .max(12)
    .default(6)
    .describe('Compare against the N months before that (1-12)')
}).strict();

export type NewServicesInput = z.infer<typeof NewServicesInputSchema>;

// Schema for detailed subaccount usage
export const SubaccountUsageInputSchema = z.object({
  subaccountId: z.string()
    .min(1)
    .describe('The unique ID of the subaccount'),
  months: z.number()
    .int()
    .min(1)
    .max(12)
    .default(3)
    .describe('Number of months to retrieve (1-12)'),
  periodPerspective: z.enum(['DAY', 'WEEK', 'MONTH'])
    .default('MONTH')
    .describe('Time granularity for the report')
}).strict();

export type SubaccountUsageInput = z.infer<typeof SubaccountUsageInputSchema>;

// Schema for cost summary
export const CostSummaryInputSchema = z.object({
  months: z.number()
    .int()
    .min(1)
    .max(12)
    .default(1)
    .describe('Number of months to summarize (1-12)'),
  groupBy: z.enum(['service', 'subaccount', 'datacenter'])
    .default('service')
    .describe('Group costs by service, subaccount, or datacenter')
}).strict();

export type CostSummaryInput = z.infer<typeof CostSummaryInputSchema>;
