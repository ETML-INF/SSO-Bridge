declare module 'sso-bridge' {
  export type SSOLoginInfo = {
    email: string;
    username: string;
    error: string;
    isSuccess: () => boolean;
  };

  export type SSOBridgeInstance = {
    generateCorrelationId: () => Promise<string>;
    buildLoginRedirectUrl: (correlationId: string, callbackUrl: string) => string;
    retrieveLoginInfo: (correlationId: string) => Promise<SSOLoginInfo>;
    buildLogoutRedirectUrl: (redirectUrl: string) => string;
  };

  export function createSSOBridge(options: {
    apiKey: string;
    ssoPortal?: string;
  }): SSOBridgeInstance;

  export function createAdonisSSOHandlers(
    bridge: SSOBridgeInstance,
    options?: {
      sessionKey?: string;
      callbackPath?: string;
      afterLogoutPath?: string;
    }
  ): {
    loginRedirect: (
      ctx: {
        request: unknown;
        response: { redirect: (url: string) => unknown };
        session: unknown;
      },
      customRedirectParams?: Record<string, string>
    ) => Promise<unknown>;
    callback: (ctx: { response: { status: (code: number) => { send: (body: unknown) => unknown } } }) => Promise<unknown>;
    logout: (ctx: { request: unknown; response: { redirect: (url: string) => unknown } }) => unknown;
  };
}
