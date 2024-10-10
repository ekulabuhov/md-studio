import parser from "@babel/parser";
import traverser from "@babel/traverse";
import {
  CallExpression,
  MemberExpression,
  Node,
  TSPropertySignature,
  TSTypeAliasDeclaration,
} from "@babel/types";
import fs from "fs";
import generator from "@babel/generator";

const generate: typeof generator = generator.default;
const traverse: typeof traverser = traverser.default;

const inputDir = "src/app";
const inputFileName = process.argv[2];
let code = fs.readFileSync(inputDir + "/" + inputFileName).toString();
const outputDir = "public";
const outputCFilePath = `${outputDir}/src/${inputFileName.replace(
  ".ts",
  ".c"
)}`;
const outputHFilePath = `${outputDir}/inc/${inputFileName.replace(
  ".ts",
  ".h"
)}`;

const ast = parser.parse(code, {
  sourceType: "module",
  plugins: ["typescript"],
});

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const headerImports: { [key: string]: boolean } = {};
const initializers: string[] = [];

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

const memberExpressions = [];
const MyVisitor = {
  MemberExpression(path: { parent: Node; node: MemberExpression }) {
    if (path.parent.type !== "MemberExpression") {
      memberExpressions.push({
        start: path.node.start,
        end: path.node.end,
        parentType: path.parent.type,
        isCallee: path.node === path.parent.callee,
        // Use objectType to distinguish between local calls and lib calls:
        // MemberExpression: this.sprite.setAnim
        // ThisExpression: this.setCameraPosition
        objectType: path.node.object.type,
      });
      console.log(
        "MemberExpression!",
        code.slice(path.node.start, path.node.end),
        path.parent.type,
        path.node.object.type
      );
    }
  },
};

type keyType = { key: string; type: string };
let classProperties: { key: string; type: string | keyType[] }[] = [];
let output = `#include "${inputFileName.replace(".ts", ".h")}"\n`;
const className = capitalizeFirstLetter(inputFileName.replace(".ts", ""));

traverse(ast, MyVisitor);

// Replaces this.posY with this->posY
// Replaces this.sprite.setAnim(...) with SPR_setAnim(this->sprite, ...)
function fixMemberExpressions() {
  let newCode = "";
  memberExpressions.forEach((me, i) => {
    if (i === 0) {
      newCode += code.slice(0, me.start);
    }
    if (me.parentType === "CallExpression" && me.isCallee) {
      me.end += 1;
      const path = code.slice(me.start, me.end).split(".");
      let memberClassName = "";
      let functionName = "";
      let instance = "this";
      if (me.objectType === "MemberExpression") {
        // Replaces this.sprite.setAnim(...) with SPR_setAnim(this->sprite, ...)
        // funky logic: sprite -> SPR or map -> MAP
        memberClassName = path[1].slice(0, 3).toUpperCase();
        functionName = path[2];
        instance = `this->${path[1]}`;
      } else if (me.objectType === 'ThisExpression') {
        // Replaces this.setCameraPosition(...) with CAMERA_setCameraPosition(this, ...)
        memberClassName = className.toUpperCase();
        functionName = path[1];
      }
      newCode += `${memberClassName}_${functionName}${instance}, `;
    } else {
      newCode += code.slice(me.start, me.end).replaceAll(".", "->");
    }
    // If there's another memberExpression
    if (i + 2 <= memberExpressions.length) {
      newCode += code.slice(me.end, memberExpressions[i + 1].start);
    } else {
      newCode += code.slice(me.end);
    }
  });

  return newCode;
}

code = fixMemberExpressions();

const imports: { [key: string]: string } = {};
const forwardDeclarations: string[] = [];

ast.program.body.forEach((node) => {
  if (node.type === "ImportDeclaration") {
    const headerFile = `${node.source.value.replace("./", "")}.h`;
    node.specifiers.forEach((specifier) => {
      if (specifier.type !== "ImportSpecifier") return;
      imports[specifier.imported.name] = headerFile;
    });
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
        if (node.type === "ClassProperty") {
          let type = "";
          let key = "";

          if (node.typeAnnotation?.type === "TSTypeAnnotation") {
            if (node.typeAnnotation.typeAnnotation.type === "TSTypeReference") {
              if (
                node.typeAnnotation.typeAnnotation.typeName.type ===
                "Identifier"
              ) {
                type = node.typeAnnotation.typeAnnotation.typeName.name;
              }
            }
          }

          if (node.key.type === "Identifier") {
            key = node.key.name;
            // Whacky heuristics: if first letter of type is uppercase, it's a pointer
            if (type && type[0] === type[0].toUpperCase()) {
              key = "*" + key;
            }
          }

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
        }

        if (node.type !== "ClassMethod") return;
        if (node.key.type !== "Identifier") return;
        const methodName = node.key.name;
        let methodHeader = `void ${className?.toUpperCase()}_${methodName}(${className} *this`;
        node.params.forEach((param) => {
          if (param.type !== "Identifier") return;
          if (!param.typeAnnotation) return;
          if (param.typeAnnotation.type !== "TSTypeAnnotation") return;
          const type = param.typeAnnotation.typeAnnotation.typeName?.name;
          let key = param.name;
          // Whacky heuristics: if first letter of type is uppercase, it's a pointer
          if (type && type[0] === type[0].toUpperCase()) {
            key = "*" + key;
          }
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
          .replaceAll("===", "==");

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
props += `} ${className};\n`;

fs.writeFileSync(
  outputHFilePath,
  `// Generated from ${inputFileName}. DO NOT EDIT.
#ifndef _${className.toUpperCase()}_H_
#define _${className.toUpperCase()}_H_

#include "types.h"
${Object.keys(headerImports)
  .map((key) => `#include "${key}"`)
  .join("\n")}

${props}
${forwardDeclarations.join("\n")}

#endif // _${className.toUpperCase()}_H_`
);

// Write converted C code
output = `// Generated from ${inputFileName}. DO NOT EDIT.\n` + output;
fs.writeFileSync(outputCFilePath, output);

// console.log(props);
// console.log(output);
// console.log({ headerImports });
// console.log({ imports });
