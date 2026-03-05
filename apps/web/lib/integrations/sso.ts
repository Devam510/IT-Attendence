// Vibe Tech Labs — SSO Adapter (SAML 2.0 / OIDC)
// Pluggable identity provider integration

// ─── Types ──────────────────────────────────────────────

export interface SsoConfig {
    provider: "ENTRA_ID" | "OKTA" | "GOOGLE" | "CUSTOM";
    protocol: "SAML" | "OIDC";
    clientId: string;
    tenantId?: string;       // For Entra ID
    domain?: string;         // For Okta
    issuerUrl: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl?: string;
    jwksUrl: string;
    redirectUri: string;
    scopes: string[];
    attributeMapping: AttributeMapping;
}

export interface AttributeMapping {
    email: string;          // e.g., "email" or "preferred_username"
    fullName: string;       // e.g., "name" or "displayName"
    employeeId?: string;    // e.g., "employee_number"
    department?: string;    // e.g., "department"
    role?: string;          // e.g., "role" or "groups"
}

export interface SsoUser {
    email: string;
    fullName: string;
    employeeId?: string;
    department?: string;
    role?: string;
    provider: string;
    providerUserId: string;
    rawAttributes: Record<string, unknown>;
}

// ─── Provider Presets ───────────────────────────────────

export function getProviderPreset(provider: "ENTRA_ID" | "OKTA" | "GOOGLE"): Partial<SsoConfig> {
    switch (provider) {
        case "ENTRA_ID":
            return {
                provider: "ENTRA_ID",
                protocol: "OIDC",
                issuerUrl: "https://login.microsoftonline.com/{tenantId}/v2.0",
                authorizationUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
                tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
                jwksUrl: "https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys",
                userInfoUrl: "https://graph.microsoft.com/v1.0/me",
                scopes: ["openid", "profile", "email", "User.Read"],
                attributeMapping: {
                    email: "preferred_username",
                    fullName: "name",
                    employeeId: "employee_id",
                    department: "department",
                },
            };
        case "OKTA":
            return {
                provider: "OKTA",
                protocol: "OIDC",
                issuerUrl: "https://{domain}/oauth2/default",
                authorizationUrl: "https://{domain}/oauth2/default/v1/authorize",
                tokenUrl: "https://{domain}/oauth2/default/v1/token",
                jwksUrl: "https://{domain}/oauth2/default/v1/keys",
                userInfoUrl: "https://{domain}/oauth2/default/v1/userinfo",
                scopes: ["openid", "profile", "email"],
                attributeMapping: {
                    email: "email",
                    fullName: "name",
                    employeeId: "employee_number",
                },
            };
        case "GOOGLE":
            return {
                provider: "GOOGLE",
                protocol: "OIDC",
                issuerUrl: "https://accounts.google.com",
                authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
                tokenUrl: "https://oauth2.googleapis.com/token",
                jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
                userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
                scopes: ["openid", "email", "profile"],
                attributeMapping: {
                    email: "email",
                    fullName: "name",
                },
            };
    }
}

// ─── OIDC Authorization URL Builder ─────────────────────

export function buildAuthorizationUrl(config: SsoConfig, state: string, nonce: string): string {
    const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(" "),
        state,
        nonce,
        response_mode: "query",
    });

    return `${config.authorizationUrl}?${params.toString()}`;
}

// ─── Map Provider Attributes to SsoUser ─────────────────

export function mapUserAttributes(
    attributes: Record<string, unknown>,
    mapping: AttributeMapping,
    provider: string
): SsoUser {
    return {
        email: String(attributes[mapping.email] || ""),
        fullName: String(attributes[mapping.fullName] || ""),
        employeeId: mapping.employeeId ? String(attributes[mapping.employeeId] || "") : undefined,
        department: mapping.department ? String(attributes[mapping.department] || "") : undefined,
        role: mapping.role ? String(attributes[mapping.role] || "") : undefined,
        provider,
        providerUserId: String(attributes["sub"] || attributes["nameId"] || ""),
        rawAttributes: attributes,
    };
}

// ─── SCIM User Provisioning Types ───────────────────────

export interface ScimUser {
    schemas: string[];
    id?: string;
    externalId: string;
    userName: string;
    name: { givenName: string; familyName: string; formatted: string };
    emails: Array<{ value: string; type: string; primary: boolean }>;
    active: boolean;
    department?: string;
    title?: string;
}

export function scimToNexusUser(scimUser: ScimUser): {
    email: string;
    fullName: string;
    designation: string | null;
    status: "ACTIVE" | "INACTIVE";
} {
    const primaryEmail = scimUser.emails.find(e => e.primary)?.value || scimUser.emails[0]?.value || scimUser.userName;

    return {
        email: primaryEmail,
        fullName: scimUser.name.formatted || `${scimUser.name.givenName} ${scimUser.name.familyName}`,
        designation: scimUser.title || null,
        status: scimUser.active ? "ACTIVE" : "INACTIVE",
    };
}
