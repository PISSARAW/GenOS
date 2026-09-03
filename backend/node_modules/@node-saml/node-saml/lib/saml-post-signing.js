"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signSamlPost = signSamlPost;
exports.signAuthnRequestPost = signAuthnRequestPost;
const xml_1 = require("./xml");
const authnRequestXPath = '/*[local-name(.)="AuthnRequest" and namespace-uri(.)="urn:oasis:names:tc:SAML:2.0:protocol"]';
const issuerXPath = '/*[local-name(.)="Issuer" and namespace-uri(.)="urn:oasis:names:tc:SAML:2.0:assertion"]';
function signSamlPost(samlMessage, xpath, options) {
    return (0, xml_1.signXml)(samlMessage, xpath, { reference: xpath + issuerXPath, action: "after" }, options);
}
function signAuthnRequestPost(authnRequest, options) {
    return signSamlPost(authnRequest, authnRequestXPath, options);
}
//# sourceMappingURL=saml-post-signing.js.map