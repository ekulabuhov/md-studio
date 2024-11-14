import { ClassProperty, Identifier, Node, TSTypeReference } from "@babel/types";
import traverser from "@babel/traverse";
import generator from "@babel/generator";
import { Imports } from "./import_declarations.mjs";

const traverse: typeof traverser = traverser.default;
const generate: typeof generator = generator.default;

export function collectClassProperties(ast: Node, imports: Imports) {
  const headerImports: { [key: string]: boolean } = {};
  const initializers: string[] = [];
  const classProperties: { key: string; type: string }[] = [];

  const classPropertyVisitor = {
    ClassProperty({ node }: { parent: Node; node: ClassProperty }) {
      const { type, key } = convertTsClassProperty(node);

      // Mark imports that we need to include in the header file
      if (imports[type]) {
        headerImports[imports[type]] = true;
      }

      if (node.value) {
        initializers.push(`this->${key} = ${generate(node.value).code};`);
      }

      classProperties.push({
        key: key,
        type: type,
      });
    },
  };

  traverse(ast, classPropertyVisitor);

  return { headerImports, initializers, classProperties }
}

// Converts: 'points: [u16,u16][]' to { type: 'u16', key: '*points[2]' }
// Converts: 'sprite: Sprite' to { type: 'Sprite', key: '*sprite' }
// Converts args in function declarations
export function convertTsClassProperty(node: ClassProperty | Identifier) {
  let type = "";
  let key = "";
  let keyIdentifier: Identifier;
  if (node.type === "ClassProperty" && node.key.type === "Identifier") {
    keyIdentifier = node.key;
  } else if (node.type === "Identifier") {
    keyIdentifier = node;
  }

  function extractTypeReferenceName(typeAnnotation: TSTypeReference) {
    const typeName = typeAnnotation.typeName;
    if (typeName.type === "Identifier") {
      return typeName.name;
    }

    return "unknown type";
  }

  if (node.typeAnnotation?.type === "TSTypeAnnotation") {
    const typeAnnotation = node.typeAnnotation.typeAnnotation;
    switch (typeAnnotation.type) {
      case "TSTypeReference":
        type = extractTypeReferenceName(typeAnnotation);
        break;
      case "TSArrayType":
        {
          const elementType = typeAnnotation.elementType;
          if (elementType.type === "TSTupleType") {
            if (elementType.elementTypes[0].type === "TSTypeReference") {
              type = extractTypeReferenceName(elementType.elementTypes[0]);
              key = `(*${keyIdentifier.name})[${elementType.elementTypes.length}]`;
            }
          }
        }
        break;

      default:
        break;
    }
  }

  if (!key) {
    key = keyIdentifier.name;
    // Whacky heuristics: if first letter of type is uppercase, it's a pointer
    if (type && type[0] === type[0].toUpperCase()) {
      key = "*" + key;
    }
  }

  return { type, key };
}
