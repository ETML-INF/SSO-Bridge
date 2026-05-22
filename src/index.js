const { SSOBridge, createSSOBridge } = require("./core/sso-bridge");
const { createAdonisSSOHandlers, buildAbsoluteUrl } = require("./adonis/handlers");

module.exports = {
  SSOBridge,
  createSSOBridge,
  createAdonisSSOHandlers,
  buildAbsoluteUrl,
};
