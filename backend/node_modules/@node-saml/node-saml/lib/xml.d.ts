import { NameID, SamlSigningOptions, XmlJsObject, XMLOutput, XmlSignatureLocation } from "./types";
export declare const xpath: {
    selectAttributes: (node: Node, xpath: string) => Array<Attr>;
    selectElements: (node: Node, xpath: string) => Array<Element>;
};
export declare const decryptXml: (xml: string, decryptionKey: string | Buffer) => Promise<string>;
/**
 * // modeled after the current validateSignature method, to maintain consistency for unit tests
 * Input: fullXml, the document for SignedXML context
 * Input: currentNode, this node must have a Signature
 * Input: pemFiles: a list of pem encoded certificates that are trusted. User is responsible for ensuring trust
 * Find's a signature for the currentNode
 * Return the verified contents if verified?
 * Otherwise returns null
 * */
export declare const getVerifiedXml: (fullXml: string, currentNode: Element, pemFiles: string[]) => string | null;
export declare const validateSignature: (fullXml: string, currentNode: Element, pemFiles: string[]) => boolean;
export declare const signXml: (xml: string, xpath: string, location: XmlSignatureLocation, options: SamlSigningOptions) => string;
export declare const parseDomFromString: (xml: string) => Promise<Document>;
export declare const parseXml2JsFromString: (xml: string | Buffer) => Promise<XmlJsObject>;
export declare const buildXml2JsObject: (rootName: string, xml: XmlJsObject) => string;
export declare const buildXmlBuilderObject: (xml: XMLOutput, pretty: boolean) => string;
export declare const promiseWithNameId: (nameid: Node) => Promise<NameID>;
export declare const getNameIdAsync: (doc: Node, decryptionPvk: string | Buffer | null) => Promise<NameID>;
