import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import xsenv from '@sap/xsenv';
import type {
  CloudCreditsDetailsResponse,
  MonthlyUsageResponse,
  MonthlyCostResponse,
  SubaccountUsageResponse
} from '../types.js';

// Load environment from default-env.json for local development
xsenv.loadEnv();

// Configuration from environment
const DESTINATION_NAME = process.env.UAS_DESTINATION_NAME || 'SAP_BTP_USAGE_API';

// Direct credentials configuration (no Destination Service needed)
interface DirectCredentials {
  url: string;
  clientId: string;
  clientSecret: string;
  tokenServiceURL: string;
}

// Get credentials - Priority: 1) Direct env vars, 2) default-env.json destinations, 3) BTP Destination Service
function getDirectCredentials(): DirectCredentials | null {
  // Option 1: Direct environment variables (simplest for cloud deployment)
  const url = process.env.UAS_API_URL;
  const clientId = process.env.UAS_CLIENT_ID;
  const clientSecret = process.env.UAS_CLIENT_SECRET;
  const tokenServiceURL = process.env.UAS_TOKEN_URL;
  
  if (url && clientId && clientSecret && tokenServiceURL) {
    return { url, clientId, clientSecret, tokenServiceURL };
  }
  
  // Option 2: From default-env.json destinations array (local development)
  try {
    const services = xsenv.readServices();
    const destinations = services?.destinations as unknown as Array<{
      name: string;
      url: string;
      clientId?: string;
      clientid?: string;
      clientSecret?: string;
      clientsecret?: string;
      tokenServiceURL?: string;
    }> | undefined;
    
    if (!destinations) {
      // Try reading from process.env.destinations (alternative format)
      const envDest = process.env.destinations;
      if (envDest) {
        const parsed = JSON.parse(envDest);
        const dest = parsed.find((d: { name: string }) => d.name === DESTINATION_NAME);
        if (dest) {
          return {
            url: dest.url,
            clientId: dest.clientId || dest.clientid,
            clientSecret: dest.clientSecret || dest.clientsecret,
            tokenServiceURL: dest.tokenServiceURL
          };
        }
      }
      return null;
    }
    
    const dest = destinations.find(d => d.name === DESTINATION_NAME);
    if (dest) {
      return {
        url: dest.url,
        clientId: dest.clientId || dest.clientid || '',
        clientSecret: dest.clientSecret || dest.clientsecret || '',
        tokenServiceURL: dest.tokenServiceURL || ''
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Get OAuth2 token
async function getOAuthToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// Make authenticated API request
async function makeApiRequest<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const directCreds = getDirectCredentials();
  
  if (directCreds) {
    // Direct credentials: use HTTP with OAuth (works locally and in cloud)
    const token = await getOAuthToken(directCreds.tokenServiceURL, directCreds.clientId, directCreds.clientSecret);
    
    const url = new URL(path, directCreds.url);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json() as T;
  } else {
    // Cloud: use SAP Cloud SDK with Destination Service
    const response = await executeHttpRequest(
      { destinationName: DESTINATION_NAME },
      {
        method: 'GET',
        url: path,
        params
      }
    );
    return response.data as T;
  }
}

// Helper to format date as YYYYMM for monthly APIs
export function formatMonthDate(date: Date): number {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return parseInt(`${year}${month}`);
}

// Helper to format date as YYYYMMDD for daily APIs
export function formatDayDate(date: Date): number {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return parseInt(`${year}${month}${day}`);
}

// Helper to get date N months ago
export function getMonthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

// Helper to convert YYYYMM to readable format
export function monthToLabel(yearMonth: number): string {
  const str = yearMonth.toString();
  const year = str.substring(0, 4);
  const month = str.substring(4, 6);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

/**
 * Get cloud credits details and balance
 */
export async function getCloudCreditsDetails(
  viewPhases: 'ALL' | 'CURRENT' = 'CURRENT'
): Promise<CloudCreditsDetailsResponse> {
  return makeApiRequest<CloudCreditsDetailsResponse>(
    '/reports/v1/cloudCreditsDetails',
    { viewPhases }
  );
}

/**
 * Get monthly usage data for the global account
 */
export async function getMonthlyUsage(
  fromDate: number,
  toDate: number
): Promise<MonthlyUsageResponse[]> {
  const data = await makeApiRequest<{ content: MonthlyUsageResponse[] }>(
    '/reports/v1/monthlyUsage',
    { fromDate, toDate }
  );
  return data.content || [];
}

/**
 * Get monthly cost data for all subaccounts
 */
export async function getMonthlySubaccountsCost(
  fromDate: number,
  toDate: number
): Promise<MonthlyCostResponse[]> {
  const data = await makeApiRequest<{ content: MonthlyCostResponse[] }>(
    '/reports/v1/monthlySubaccountsCost',
    { fromDate, toDate }
  );
  return data.content || [];
}

/**
 * Get usage data for a specific subaccount
 */
export async function getSubaccountUsage(
  subaccountId: string,
  fromDate: number,
  toDate: number,
  periodPerspective?: 'DAY' | 'WEEK' | 'MONTH'
): Promise<SubaccountUsageResponse[]> {
  const params: Record<string, string | number> = {
    subaccountId,
    fromDate,
    toDate
  };
  
  if (periodPerspective) {
    params.periodPerspective = periodPerspective;
  }
  
  const data = await makeApiRequest<{ content: SubaccountUsageResponse[] }>(
    '/reports/v1/subaccountUsage',
    params
  );
  return data.content || [];
}

/**
 * Aggregate costs by service
 */
export function aggregateCostsByService(costs: MonthlyCostResponse[]): Map<string, {
  serviceName: string;
  serviceId: string;
  totalCost: number;
  totalUsage: number;
  currency: string;
  metricName: string;
  unitPlural: string;
  subaccounts: Set<string>;
  hasOverusage: boolean;
  paygCost: number;
}> {
  const serviceMap = new Map<string, {
    serviceName: string;
    serviceId: string;
    totalCost: number;
    totalUsage: number;
    currency: string;
    metricName: string;
    unitPlural: string;
    subaccounts: Set<string>;
    hasOverusage: boolean;
    paygCost: number;
  }>();
  
  for (const item of costs) {
    const key = item.serviceId;
    const existing = serviceMap.get(key);
    
    if (existing) {
      existing.totalCost += item.cost || 0;
      existing.totalUsage += item.usage || 0;
      existing.subaccounts.add(item.subaccountName);
      existing.paygCost += item.paygCost || 0;
      if ((item.actualUsage ?? 0) > 0 || (item.paygCost ?? 0) > 0) {
        existing.hasOverusage = true;
      }
    } else {
      serviceMap.set(key, {
        serviceName: item.serviceName,
        serviceId: item.serviceId,
        totalCost: item.cost || 0,
        totalUsage: item.usage || 0,
        currency: item.currency,
        metricName: item.metricName,
        unitPlural: item.unitPlural,
        subaccounts: new Set([item.subaccountName]),
        hasOverusage: (item.actualUsage ?? 0) > 0 || (item.paygCost ?? 0) > 0,
        paygCost: item.paygCost || 0
      });
    }
  }
  
  return serviceMap;
}

/**
 * Find items with overusage (usage beyond quota)
 */
export function findOverusageItems(costs: MonthlyCostResponse[]): {
  serviceName: string;
  planName: string;
  subaccountName: string;
  quota: number;
  actualUsage: number;
  overusageAmount: number;
  paygCost: number;
  reportYearMonth: number;
}[] {
  return costs
    .filter(item => (item.actualUsage ?? 0) > 0 || (item.paygCost ?? 0) > 0)
    .map(item => ({
      serviceName: item.serviceName,
      planName: item.planName,
      subaccountName: item.subaccountName,
      quota: item.quota ?? 0,
      actualUsage: item.actualUsage ?? 0,
      overusageAmount: item.actualUsage ?? 0,
      paygCost: item.paygCost ?? 0,
      reportYearMonth: item.reportYearMonth
    }));
}

/**
 * Detect newly enabled services (services that appear in recent months but not before)
 */
export function detectNewServices(
  recentCosts: MonthlyCostResponse[],
  olderCosts: MonthlyCostResponse[]
): string[] {
  const olderServices = new Set(olderCosts.map(c => c.serviceId));
  const recentServices = new Set(recentCosts.map(c => c.serviceId));
  
  const newServices: string[] = [];
  for (const serviceId of recentServices) {
    if (!olderServices.has(serviceId)) {
      const item = recentCosts.find(c => c.serviceId === serviceId);
      if (item) {
        newServices.push(item.serviceName);
      }
    }
  }
  
  return [...new Set(newServices)];
}
