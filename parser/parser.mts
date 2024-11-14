import parser from "@babel/parser";
import traverser from "@babel/traverse";
import {
  TSPropertySignature,
  TSTypeAliasDeclaration,
} from "@babel/types";
import generator from "@babel/generator";
import { snakeCaseToPascalCase } from "../src/app/utils";
import { fixMemberExpressions } from "./member_expressions.mjs";
import { collectImportDeclarations } from "./import_declarations.mjs";
import { collectClassProperties, convertTsClassProperty } from "./class_properties.mjs";

const generate: typeof generator = generator.default;
const traverse: typeof traverser = traverser.default;

export function parse(code: string, inputFileName: string) {
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["typescript"],
  });

  const imports: { [key: string]: string } = collectImportDeclarations(ast);
  const { headerImports, initializers, classProperties } = collectClassProperties(ast, imports);

  function convertTsPropertySignatureToField(node: TSPropertySignature) {
    if (node.type !== "TSPropertySignature") {
      throw new Error("Invalid type");
    }

    if (node.key.type !== "Identifier") {
      throw new Error("Invalid type");
    }

    if (node.typeAnnotation?.type !== "TSTypeAnnotation") {
      throw new Error("Invalid type");
    }

    if (node.typeAnnotation.typeAnnotation.type !== "TSTypeReference") {
      throw new Error("Invalid type");
    }

    if (node.typeAnnotation.typeAnnotation.typeName.type !== "Identifier") {
      throw new Error("Invalid type");
    }

    const typeName = node.typeAnnotation.typeAnnotation.typeName.name;

    return `    ${typeName} ${node.key.name};\n`;
  }

  function convertTsTypeAliasDeclarationToStruct(node: TSTypeAliasDeclaration) {
    let output = `typedef struct {\n`;

    if (node.typeAnnotation.type !== "TSTypeLiteral") {
      throw new Error("Invalid type");
    }

    node.typeAnnotation.members.forEach((member) => {
      if (member.type !== "TSPropertySignature") {
        throw new Error("Invalid type");
      }
      output += convertTsPropertySignatureToField(member);
    });
    output += `} ${node.id.name};\n`;
    return output;
  }

  let output = `#include "${inputFileName.replace(".ts", ".h")}"\n`;
  const className = inputFileName.replace(".ts", "");
  const structName = snakeCaseToPascalCase(className);

  code = fixMemberExpressions(ast, code, className, classProperties);

  const forwardDeclarations: string[] = [];

  ast.program.body.forEach((node) => {
    if (node.type === "ImportDeclaration") {
      const headerFile = `${node.source.value.replace("./", "")}.h`;
      output += `#include "${headerFile}"\n`;
    }

    // type T = { a: number; b: string; }
    if (node.type === "TSTypeAliasDeclaration") {
      output += convertTsTypeAliasDeclarationToStruct(node);
    }

    // Converts top level variables to #define's
    // E.g. const A = 1; => #define A 1
    if (node.type === "VariableDeclaration") {
      let key = "";
      let value;
      if (node.declarations[0].id.type === "Identifier") {
        key = node.declarations[0].id.name;
      }

      node.leadingComments?.forEach((comment) => {
        output += `// ${comment.value}\n`;
      });

      value = generate(node.declarations[0].init).code;

      output += `#define ${key.toUpperCase()} ${value}\n`;
    }

    if (node.type === "ExportNamedDeclaration") {
      output += "\n";
      if (node.declaration?.type === "ClassDeclaration") {
        node.declaration.body.body.forEach((node) => {
          if (node.type !== "ClassMethod") return;
          if (node.key.type !== "Identifier") return;
          const methodReturnType = node.returnType
            ? node.returnType.typeAnnotation.typeName?.name
            : "void";
          const methodName = node.key.name;
          let methodHeader = `${methodReturnType} ${className?.toUpperCase()}_${methodName}(${structName} *this`;
          node.params.forEach((param) => {
            if (param.type !== "Identifier") return;
            const { key, type } = convertTsClassProperty(param);
            headerImports[imports[type]] = true;
            methodHeader += `, ${type} ${key}`;
          });
          methodHeader += ")";
          forwardDeclarations.push(methodHeader + ";");
          output += `${methodHeader} {\n`;
          if (methodName === "constructor") {
            output += "    " + initializers.join("\n    ") + "\n";
          }

          output += code
            .split("\n")
            .slice(node.loc?.start.line, node.loc?.end.line)
            .join("\n")
            .replaceAll("let ", "s16 ")
            .replaceAll("const ", "s16 ")
            .replaceAll("===", "==")
            .replaceAll("!==", "!=");

          output += `\n\n`;
        });
      }
    }
  });

  // Write header file with typedef'd struct and forward method declarations
  let props = "";
  props += `typedef struct {\n`;
  classProperties.forEach((property) => {
    props += `    ${property.type || "s16"} ${property.key};\n`;
  });
  props += `} ${structName};\n`;  

  return { className, headerImports, props, forwardDeclarations, output };
}
