export type SsoLoginResult = {
  email: string
  username: string
  error?: string
  isSuccess: () => boolean
}

export class SSOBridge {
  constructor(options: { apiKey: string; ssoPortal: string })

  generateCorrelationId(): Promise<string>
  buildLoginRedirectUrl(correlationId: string, callbackUrl: string): string
  retrieveLoginInfo(correlationId: string): Promise<SsoLoginResult>
  buildLogoutRedirectUrl(redirectUrl: string): string
}

export function createSSOBridge(options: { apiKey: string; ssoPortal: string }): SSOBridge

export function buildAbsoluteUrl(
  request: unknown,
  path: string,
  passthrough?: Record<string, unknown>
): string

export function createAdonisSSOHandlers(
  bridge: SSOBridge,
  options?: {
    sessionKey?: string
    callbackPath?: string
    afterLogoutPath?: string
  }
): {
  loginRedirect: (ctx: any, customRedirectParams?: Record<string, unknown>) => Promise<any>
  callback: (ctx: any) => Promise<SsoLoginResult>
  logout: (ctx: any) => any
}

export function createAdonisSSOFlow(
  bridge: SSOBridge,
  options?: {
    sessionKey?: string
    callbackPath?: string
    afterLogoutPath?: string
    loginPath?: string
    logoutPath?: string
    failureRedirect?: string
    successRedirect?: string
    authGuard?: string
  }
): {
  status: (ctx: any) => any
  loginRedirect: (ctx: any, customRedirectParams?: Record<string, unknown>) => Promise<any>
  callbackLogin: (ctx: any, findOrCreateUser: (payload: SsoLoginResult, ctx: any) => Promise<any>) => Promise<any>
  logout: (ctx: any) => Promise<any>
}
