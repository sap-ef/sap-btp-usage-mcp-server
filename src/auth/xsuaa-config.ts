import xsenv from '@sap/xsenv';

/**
 * XSUAA Service Configuration Interface
 */
export interface XsuaaCredentials {
  clientid: string;
  clientsecret: string;
  url: string;
  uaadomain: string;
  verificationkey: string;
  xsappname: string;
  identityzone?: string;
  identityzoneid?: string;
  tenantid?: string;
  tenantmode?: string;
}

/**
 * Environment variable to enable/disable authentication
 * Set to 'false' to disable auth (useful for local development)
 */
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

/**
 * Get XSUAA service credentials from VCAP_SERVICES
 * This function loads the XSUAA service bound to the application
 */
export function getXsuaaCredentials(): XsuaaCredentials | null {
  try {
    // Load environment (works both locally with default-env.json and in Cloud Foundry)
    xsenv.loadEnv();
    
    // Try to get XSUAA service by tag
    const services = xsenv.getServices({
      xsuaa: { tag: 'xsuaa' }
    });
    
    if (services.xsuaa) {
      const creds = services.xsuaa as XsuaaCredentials;
      console.log('✓ XSUAA credentials loaded successfully');
      console.log(`  - Identity Zone: ${creds.identityzone || 'N/A'}`);
      console.log(`  - Client ID: ${creds.clientid?.substring(0, 20)}...`);
      return creds;
    }
    
    // Fallback: try to read from VCAP_SERVICES directly
    if (process.env.VCAP_SERVICES) {
      const vcapServices = JSON.parse(process.env.VCAP_SERVICES);
      if (vcapServices.xsuaa && vcapServices.xsuaa.length > 0) {
        const xsuaaService = vcapServices.xsuaa[0];
        console.log('✓ XSUAA credentials loaded from VCAP_SERVICES');
        return xsuaaService.credentials as XsuaaCredentials;
      }
    }
    
    console.warn('⚠ XSUAA service not found in VCAP_SERVICES');
    return null;
  } catch (error) {
    console.error('✗ Error loading XSUAA credentials:', error);
    return null;
  }
}

/**
 * Check if authentication is enabled
 * Can be disabled via AUTH_ENABLED=false environment variable
 */
export function isAuthEnabled(): boolean {
  return AUTH_ENABLED;
}

/**
 * Get XSUAA configuration for use in middleware
 * Returns null if auth is disabled or credentials not found
 */
export function getXsuaaConfig(): XsuaaCredentials | null {
  if (!isAuthEnabled()) {
    console.log('ℹ Authentication is DISABLED (AUTH_ENABLED=false)');
    return null;
  }
  
  return getXsuaaCredentials();
}
