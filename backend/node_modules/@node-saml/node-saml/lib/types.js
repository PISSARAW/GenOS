"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SamlStatusError = exports.ValidateInResponseTo = exports.isValidSamlSigningOptions = void 0;
const isValidSamlSigningOptions = (options) => {
    return options.privateKey != null;
};
exports.isValidSamlSigningOptions = isValidSamlSigningOptions;
var ValidateInResponseTo;
(function (ValidateInResponseTo) {
    ValidateInResponseTo["never"] = "never";
    ValidateInResponseTo["ifPresent"] = "ifPresent";
    ValidateInResponseTo["always"] = "always";
})(ValidateInResponseTo || (exports.ValidateInResponseTo = ValidateInResponseTo = {}));
class SamlStatusError extends Error {
    constructor(message, xmlStatus) {
        super(message);
        this.xmlStatus = xmlStatus;
    }
}
exports.SamlStatusError = SamlStatusError;
//# sourceMappingURL=types.js.map