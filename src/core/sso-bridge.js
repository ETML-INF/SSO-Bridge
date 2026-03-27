const crypto = require("crypto");

class SSOBridge {
  constructor(options) {
    if (!options || !options.apiKey) {
      throw new Error("Missing required option: apiKey");
    }

    this.apiKey = options.apiKey;
    this.ssoPortal = options.ssoPortal || "https://apps.pm2etml.ch/auth/";
  }

  buildUrl(pathname, params = {}) {
    const url = new URL(pathname, this.ssoPortal);
    Object.entries(params).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(name, String(value));
      }
    });
    return url;
  }

  async generateCorrelationId() {
    try {
      const url = this.buildUrl("bridge/cid", { token: this.apiKey });
      const response = await fetch(url.toString());
      if (response.ok) {
        const payload = await response.json();
        if (payload && payload.correlationId) {
          return String(payload.correlationId);
        }
      }
    } catch (_error) {
      // Fall through to local generation.
    }

    return crypto.randomBytes(32).toString("hex");
  }

  buildLoginRedirectUrl(correlationId, callbackUrl) {
    if (!correlationId) {
      throw new Error("Missing correlationId");
    }
    if (!callbackUrl) {
      throw new Error("Missing callbackUrl");
    }

    return this.buildUrl("redirect", {
      correlationId,
      redirectUri: callbackUrl,
    }).toString();
  }

  async retrieveLoginInfo(correlationId) {
    const result = {
      email: "",
      username: "",
      error: "",
      isSuccess() {
        return this.error === "";
      },
    };

    if (!correlationId) {
      result.error = "Missing correlationId";
      return result;
    }

    const url = this.buildUrl("bridge/check", {
      token: this.apiKey,
      correlationId,
    });

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        result.error = `Cannot GET ${url.toString()} (status ${response.status})`;
        return result;
      }

      const payload = await response.json();
      if (payload && payload.error) {
        result.error = String(payload.error);
        return result;
      }

      result.username = String((payload && payload.username) || "");
      result.email = String((payload && payload.email) || "");
      return result;
    } catch (_error) {
      result.error = `Cannot GET ${url.toString()} (network or parsing issue)`;
      return result;
    }
  }

  buildLogoutRedirectUrl(redirectUrl) {
    if (!redirectUrl) {
      throw new Error("Missing redirectUrl");
    }

    return this.buildUrl("bridge/logout", { redirectUri: redirectUrl }).toString();
  }
}

function createSSOBridge(options) {
  return new SSOBridge(options);
}

module.exports = {
  SSOBridge,
  createSSOBridge,
};
