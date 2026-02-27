import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getCloudCreditsDetails,
  getMonthlySubaccountsCost,
  getMonthlyUsage,
  getSubaccountUsage,
  formatMonthDate,
  formatDayDate,
  getMonthsAgo,
  monthToLabel,
  aggregateCostsByService,
  findOverusageItems,
  detectNewServices
} from '../services/sap-api-client.js';
import {
  CloudCreditsInputSchema,
  TopServicesInputSchema,
  MonthlyComparisonInputSchema,
  OverusageInputSchema,
  NewServicesInputSchema,
  SubaccountUsageInputSchema,
  CostSummaryInputSchema,
  type CloudCreditsInput,
  type TopServicesInput,
  type MonthlyComparisonInput,
  type OverusageInput,
  type NewServicesInput,
  type SubaccountUsageInput,
  type CostSummaryInput
} from '../schemas/input-schemas.js';

export function registerTools(server: McpServer): void {
  
  // Tool 1: Get Cloud Credits Balance
  server.registerTool(
    'sap_btp_get_cloud_credits',
    {
      title: 'Get Cloud Credits Balance',
      description: `Get the current cloud credits balance and contract details for the SAP BTP global account.

Returns information about:
- Current cloud credits balance
- Contract phases and dates
- Credit consumption history

Use this to answer questions like:
- "How many cloud credits do we have left?"
- "When does our contract expire?"
- "What's our credit balance history?"

Args:
  - viewPhases ('ALL' | 'CURRENT'): Show all phases or just current (default: CURRENT)

Returns: JSON with globalAccountId, globalAccountName, contracts array with phases and balances`,
      inputSchema: CloudCreditsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: CloudCreditsInput) => {
      try {
        const data = await getCloudCreditsDetails(params.viewPhases);
        
        // Extract current balance from latest phase update
        let currentBalance = 0;
        let totalCredits = 0;
        let contractEnd = '';
        
        if (data.contracts?.length > 0) {
          const latestContract = data.contracts[0];
          contractEnd = latestContract.contractEndDate;
          
          if (latestContract.phases?.length > 0) {
            const latestPhase = latestContract.phases[latestContract.phases.length - 1];
            if (latestPhase.phaseUpdates?.length > 0) {
              const latestUpdate = latestPhase.phaseUpdates[latestPhase.phaseUpdates.length - 1];
              currentBalance = latestUpdate.balance;
              totalCredits = latestUpdate.cloudCreditsForPhase;
            }
          }
        }
        
        const summary = {
          globalAccountName: data.globalAccountName,
          currentBalance,
          totalCredits,
          usedCredits: totalCredits - currentBalance,
          usagePercentage: totalCredits > 0 ? ((totalCredits - currentBalance) / totalCredits * 100).toFixed(1) : 0,
          contractEndDate: contractEnd,
          fullDetails: data
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(summary, null, 2)
          }],
          structuredContent: summary
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Error fetching cloud credits: ${message}`
          }]
        };
      }
    }
  );

  // Tool 2: Get Top Services by Cost/Consumption
  server.registerTool(
    'sap_btp_top_services',
    {
      title: 'Get Top Services by Cost',
      description: `Get the top services consuming the most cloud credits or resources.

Use this to answer questions like:
- "Which services are consuming the most credits?"
- "What are our highest cost services?"
- "Show me the top 5 services by usage"

Args:
  - months (number): Number of months to analyze, 1-24 (default: 3)
  - limit (number): Max services to return, 1-50 (default: 10)
  - sortBy ('cost' | 'usage'): Sort by cost or usage (default: cost)

Returns: Ranked list of services with cost, usage, and overusage indicators`,
      inputSchema: TopServicesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: TopServicesInput) => {
      try {
        const toDate = formatMonthDate(new Date());
        const fromDate = formatMonthDate(getMonthsAgo(params.months));
        
        const costs = await getMonthlySubaccountsCost(fromDate, toDate);
        const serviceMap = aggregateCostsByService(costs);
        
        // Convert to array and sort
        const services = Array.from(serviceMap.values())
          .map(s => ({
            ...s,
            subaccounts: Array.from(s.subaccounts)
          }))
          .sort((a, b) => params.sortBy === 'cost' 
            ? b.totalCost - a.totalCost 
            : b.totalUsage - a.totalUsage)
          .slice(0, params.limit);
        
        const result = {
          period: `${monthToLabel(fromDate)} to ${monthToLabel(toDate)}`,
          totalServices: serviceMap.size,
          topServices: services,
          totalCost: services.reduce((sum, s) => sum + s.totalCost, 0),
          currency: services[0]?.currency || 'EUR'
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Error fetching top services: ${message}`
          }]
        };
      }
    }
  );

  // Tool 3: Compare Monthly Consumption
  server.registerTool(
    'sap_btp_compare_months',
    {
      title: 'Compare Monthly Consumption',
      description: `Compare cloud credits consumption across multiple months to identify trends.

Use this to answer questions like:
- "Compare consumption of the last 3 months"
- "How has our usage changed month over month?"
- "Show me the trend for service X"

Args:
  - months (number): Number of months to compare, 2-12 (default: 3)
  - serviceName (string, optional): Filter to a specific service

Returns: Month-by-month breakdown with costs, usage, and percentage changes`,
      inputSchema: MonthlyComparisonInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: MonthlyComparisonInput) => {
      try {
        const toDate = formatMonthDate(new Date());
        const fromDate = formatMonthDate(getMonthsAgo(params.months));
        
        const costs = await getMonthlySubaccountsCost(fromDate, toDate);
        
        // Filter by service if specified
        const filteredCosts = params.serviceName
          ? costs.filter(c => c.serviceName.toLowerCase().includes(params.serviceName!.toLowerCase()))
          : costs;
        
        // Group by month
        const monthlyData = new Map<number, { totalCost: number; totalUsage: number; services: Map<string, number> }>();
        
        for (const item of filteredCosts) {
          const month = item.reportYearMonth;
          const existing = monthlyData.get(month) || { totalCost: 0, totalUsage: 0, services: new Map() };
          existing.totalCost += item.cost || 0;
          existing.totalUsage += item.usage || 0;
          
          const serviceCost = existing.services.get(item.serviceName) || 0;
          existing.services.set(item.serviceName, serviceCost + (item.cost || 0));
          
          monthlyData.set(month, existing);
        }
        
        // Convert to sorted array
        const months = Array.from(monthlyData.entries())
          .sort(([a], [b]) => a - b)
          .map(([month, data], index, arr) => {
            const prevMonth = index > 0 ? arr[index - 1][1] : null;
            const costChange = prevMonth 
              ? ((data.totalCost - prevMonth.totalCost) / prevMonth.totalCost * 100).toFixed(1)
              : null;
            
            return {
              month,
              monthLabel: monthToLabel(month),
              totalCost: Math.round(data.totalCost * 100) / 100,
              totalUsage: Math.round(data.totalUsage * 100) / 100,
              costChangePercent: costChange,
              topServices: Array.from(data.services.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name, cost]) => ({ name, cost: Math.round(cost * 100) / 100 }))
            };
          });
        
        const result = {
          period: `${monthToLabel(fromDate)} to ${monthToLabel(toDate)}`,
          serviceFilter: params.serviceName || 'All services',
          monthlyBreakdown: months,
          summary: {
            averageMonthlyCost: Math.round(months.reduce((sum, m) => sum + m.totalCost, 0) / months.length * 100) / 100,
            highestMonth: months.reduce((max, m) => m.totalCost > max.totalCost ? m : max, months[0]),
            lowestMonth: months.reduce((min, m) => m.totalCost < min.totalCost ? m : min, months[0])
          }
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Error comparing months: ${message}`
          }]
        };
      }
    }
  );

  // Tool 4: Check for Overusage
  server.registerTool(
    'sap_btp_check_overusage',
    {
      title: 'Check for Overusage',
      description: `Check if any services have exceeded their quota (overusage) resulting in additional PAYG charges.

Use this to answer questions like:
- "Is there any overusage?"
- "Which services exceeded their quota?"
- "Are we paying extra beyond our credits?"

Args:
  - months (number): Number of months to check, 1-12 (default: 3)

Returns: List of services with overusage, showing quota, actual usage, and PAYG costs`,
      inputSchema: OverusageInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: OverusageInput) => {
      try {
        const toDate = formatMonthDate(new Date());
        const fromDate = formatMonthDate(getMonthsAgo(params.months));
        
        const costs = await getMonthlySubaccountsCost(fromDate, toDate);
        const overusageItems = findOverusageItems(costs);
        
        // Aggregate by service
        const serviceOverusage = new Map<string, {
          serviceName: string;
          totalOverusage: number;
          totalPaygCost: number;
          occurrences: number;
          details: typeof overusageItems;
        }>();
        
        for (const item of overusageItems) {
          const existing = serviceOverusage.get(item.serviceName) || {
            serviceName: item.serviceName,
            totalOverusage: 0,
            totalPaygCost: 0,
            occurrences: 0,
            details: []
          };
          existing.totalOverusage += item.overusageAmount;
          existing.totalPaygCost += item.paygCost;
          existing.occurrences += 1;
          existing.details.push(item);
          serviceOverusage.set(item.serviceName, existing);
        }
        
        const result = {
          period: `${monthToLabel(fromDate)} to ${monthToLabel(toDate)}`,
          hasOverusage: overusageItems.length > 0,
          totalOverusageItems: overusageItems.length,
          totalPaygCost: overusageItems.reduce((sum, i) => sum + i.paygCost, 0),
          servicesSummary: Array.from(serviceOverusage.values())
            .sort((a, b) => b.totalPaygCost - a.totalPaygCost),
          allOverusageDetails: overusageItems
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Error checking overusage: ${message}`
          }]
        };
      }
    }
  );

  // Tool 5: Find Newly Enabled Services
  server.registerTool(
    'sap_btp_new_services',
    {
      title: 'Find Newly Enabled Services',
      description: `Find services that were enabled/started in recent months (not present in earlier periods).

Use this to answer questions like:
- "Which services were enabled in the last 3 months?"
- "What new services did we start using?"
- "Show me recently added services"

Args:
  - recentMonths (number): Consider last N months as "recent", 1-6 (default: 3)
  - comparisonMonths (number): Compare against N months before that, 1-12 (default: 6)

Returns: List of newly enabled service names`,
      inputSchema: NewServicesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: NewServicesInput) => {
      try {
        // Recent period
        const recentTo = formatMonthDate(new Date());
        const recentFrom = formatMonthDate(getMonthsAgo(params.recentMonths));
        
        // Older period (for comparison)
        const olderTo = formatMonthDate(getMonthsAgo(params.recentMonths));
        const olderFrom = formatMonthDate(getMonthsAgo(params.recentMonths + params.comparisonMonths));
        
        const [recentCosts, olderCosts] = await Promise.all([
          getMonthlySubaccountsCost(recentFrom, recentTo),
          getMonthlySubaccountsCost(olderFrom, olderTo)
        ]);
        
        const newServices = detectNewServices(recentCosts, olderCosts);
        
        // Get details about new services
        const newServiceDetails = newServices.map(serviceName => {
          const items = recentCosts.filter(c => c.serviceName === serviceName);
          const totalCost = items.reduce((sum, i) => sum + (i.cost || 0), 0);
          const subaccounts = [...new Set(items.map(i => i.subaccountName))];
          const firstSeen = Math.min(...items.map(i => i.reportYearMonth));
          
          return {
            serviceName,
            firstSeenMonth: monthToLabel(firstSeen),
            totalCostSinceEnabled: Math.round(totalCost * 100) / 100,
            subaccounts
          };
        });
        
        const result = {
          recentPeriod: `${monthToLabel(recentFrom)} to ${monthToLabel(recentTo)}`,
          comparisonPeriod: `${monthToLabel(olderFrom)} to ${monthToLabel(olderTo)}`,
          newServicesCount: newServices.length,
          newServices: newServiceDetails.sort((a, b) => b.totalCostSinceEnabled - a.totalCostSinceEnabled)
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Error finding new services: ${message}`
          }]
        };
      }
    }
  );

  // Tool 6: Get Cost Summary
  server.registerTool(
    'sap_btp_cost_summary',
    {
      title: 'Get Cost Summary',
      description: `Get a summary of costs grouped by service, subaccount, or datacenter.

Use this for general cost overview questions like:
- "What's our total cost this month?"
- "Show costs by subaccount"
- "Break down costs by datacenter"

Args:
  - months (number): Number of months to summarize, 1-12 (default: 1)
  - groupBy ('service' | 'subaccount' | 'datacenter'): Grouping dimension (default: service)

Returns: Aggregated cost summary with breakdown by the specified dimension`,
      inputSchema: CostSummaryInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: CostSummaryInput) => {
      try {
        const toDate = formatMonthDate(new Date());
        const fromDate = formatMonthDate(getMonthsAgo(params.months));
        
        const costs = await getMonthlySubaccountsCost(fromDate, toDate);
        
        // Group by specified dimension
        const grouped = new Map<string, { name: string; totalCost: number; totalUsage: number; items: number }>();
        
        for (const item of costs) {
          let key: string;
          let name: string;
          
          switch (params.groupBy) {
            case 'subaccount':
              key = item.subaccountId;
              name = item.subaccountName;
              break;
            case 'datacenter':
              key = item.dataCenter;
              name = item.dataCenterName || item.dataCenter;
              break;
            default:
              key = item.serviceId;
              name = item.serviceName;
          }
          
          const existing = grouped.get(key) || { name, totalCost: 0, totalUsage: 0, items: 0 };
          existing.totalCost += item.cost || 0;
          existing.totalUsage += item.usage || 0;
          existing.items += 1;
          grouped.set(key, existing);
        }
        
        const breakdown = Array.from(grouped.values())
          .sort((a, b) => b.totalCost - a.totalCost)
          .map(g => ({
            ...g,
            totalCost: Math.round(g.totalCost * 100) / 100
          }));
        
        const totalCost = breakdown.reduce((sum, g) => sum + g.totalCost, 0);
        
        const result = {
          period: `${monthToLabel(fromDate)} to ${monthToLabel(toDate)}`,
          groupedBy: params.groupBy,
          totalCost: Math.round(totalCost * 100) / 100,
          currency: costs[0]?.currency || 'EUR',
          itemCount: breakdown.length,
          breakdown
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Error getting cost summary: ${message}`
          }]
        };
      }
    }
  );
}
