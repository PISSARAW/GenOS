"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertRequired = assertRequired;
exports.assertBooleanIfPresent = assertBooleanIfPresent;
exports.signXmlResponse = signXmlResponse;
exports.signXmlMetadata = signXmlMetadata;
const xml_1 = require("./xml");
function assertRequired(value, error) {
    if (value === undefined || value === null || (typeof value === "string" && value.length === 0)) {
        throw new TypeError(error !== null && error !== void 0 ? error : "value does not exist");
    }
}
function assertBooleanIfPresent(value, error) {
    if (value != null && typeof value != "boolean") {
        throw new TypeError(error !== null && error !== void 0 ? error : "value is set but not boolean");
    }
}
function signXmlResponse(samlMessage, options) {
    const responseXpath = '//*[local-name(.)="Response" and namespace-uri(.)="urn:oasis:names:tc:SAML:2.0:protocol"]';
    return (0, xml_1.signXml)(samlMessage, responseXpath, { reference: responseXpath, action: "append" }, options);
}
function signXmlMetadata(metadataXml, options) {
    const metadataXpath = '//*[local-name(.)="EntityDescriptor" and namespace-uri(.)="urn:oasis:names:tc:SAML:2.0:metadata"]';
    return (0, xml_1.signXml)(metadataXml, metadataXpath, { reference: metadataXpath, action: "prepend" }, options);
}
//# sourceMappingURL=utility.js.map