import { type XlsxLimits, XlsxError } from "./XlsxError";

export interface XmlElement {
  /** Local name, without any namespace prefix. */
  readonly name: string;
  /** Attributes by local name, entities decoded. */
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: XmlNode[];
}

export type XmlNode = XmlElement | string;

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/uy;
const NAME = /[^\s/>]+/uy;
const ENTITY_OR_AMPERSAND = /&(?:(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);)?/gu;
const MAX_CODE_POINT = 0x10ffff;

function fail(message: string): never {
  throw new XlsxError("malformed-xml", message);
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY_OR_AMPERSAND, (_match, entity: string | undefined) => {
    // A bare ampersand or an undefined entity such as &foo; is not allowed in this subset.
    if (entity === undefined) return fail("The file uses an XML entity that is not supported.");
    if (entity.startsWith("#")) {
      const code = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      if (code > MAX_CODE_POINT) return fail("The file uses an invalid character reference.");
      return String.fromCodePoint(code);
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity] ?? "";
  });
}

/**
 * Parses the XML subset found in spreadsheet files: elements, attributes, text,
 * CDATA and the five standard entities. Document type declarations (and so any
 * entity definitions) are rejected outright, which rules out entity-expansion
 * attacks. Depth and element count are bounded. Text is never trimmed.
 */
export function parseXml(source: string, limits: XlsxLimits): XmlElement {
  let root: XmlElement | null = null;
  const stack: XmlElement[] = [];
  let elements = 0;
  let position = 0;

  const appendText = (text: string): void => {
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      if (text.trim() !== "") fail("Text appears outside the document element.");
      return;
    }
    if (text !== "") parent.children.push(text);
  };

  while (position < source.length) {
    const open = source.indexOf("<", position);
    if (open === -1) {
      appendText(decodeEntities(source.slice(position)));
      break;
    }
    if (open > position) appendText(decodeEntities(source.slice(position, open)));

    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      if (end === -1) fail("An XML comment is not closed.");
      position = end + 3;
    } else if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open + 9);
      if (end === -1) fail("A CDATA section is not closed.");
      appendText(source.slice(open + 9, end));
      position = end + 3;
    } else if (source.startsWith("<!", open)) {
      fail("Document type declarations are not allowed.");
    } else if (source.startsWith("<?", open)) {
      const end = source.indexOf("?>", open + 2);
      if (end === -1) fail("A processing instruction is not closed.");
      position = end + 2;
    } else if (source.startsWith("</", open)) {
      const end = source.indexOf(">", open + 2);
      if (end === -1) fail("A closing tag is not finished.");
      const closing = stack.pop();
      if (closing === undefined || closing.name !== localName(source.slice(open + 2, end).trim())) {
        fail("The XML tags are not properly nested.");
      }
      position = end + 1;
    } else {
      NAME.lastIndex = open + 1;
      const nameMatch = NAME.exec(source);
      if (nameMatch === null) fail("A tag has no name.");
      const name = localName(nameMatch[0]);
      const attrs: Record<string, string> = {};
      let cursor = NAME.lastIndex;
      for (;;) {
        while (/\s/u.test(source[cursor] ?? "")) cursor++;
        const character = source[cursor];
        if (character === undefined) fail("A tag is not finished.");
        if (character === ">" || character === "/") break;
        ATTRIBUTE.lastIndex = cursor;
        const match = ATTRIBUTE.exec(source);
        if (match === null) fail("An attribute is malformed.");
        attrs[localName(match[1] ?? "")] = decodeEntities(match[2] ?? match[3] ?? "");
        cursor = ATTRIBUTE.lastIndex;
      }
      const selfClosing = source[cursor] === "/";
      if (selfClosing) {
        cursor++;
        if (source[cursor] !== ">") fail("A tag is not finished.");
      }
      position = cursor + 1;

      elements++;
      if (elements > limits.maxXmlElements) {
        throw new XlsxError("limit-exceeded", "The file contains too many XML elements.");
      }
      const element: XmlElement = { name, attrs, children: [] };
      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        if (root !== null) fail("The document has more than one root element.");
        root = element;
      } else {
        parent.children.push(element);
      }
      if (!selfClosing) {
        stack.push(element);
        if (stack.length > limits.maxXmlDepth) {
          throw new XlsxError("limit-exceeded", "The XML is nested too deeply.");
        }
      }
    }
  }
  if (stack.length > 0) fail("The XML ends before all tags are closed.");
  if (root === null) fail("The XML has no document element.");
  return root;
}

export function childElements(element: XmlElement, name?: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => typeof child !== "string" && (name === undefined || child.name === name),
  );
}

export function firstChild(element: XmlElement, name: string): XmlElement | undefined {
  return childElements(element, name)[0];
}

/** The element's own text, concatenated from its direct text children. */
export function textOf(element: XmlElement): string {
  return element.children.filter((child): child is string => typeof child === "string").join("");
}
