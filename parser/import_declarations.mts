import { ImportDeclaration, Node } from "@babel/types";
import traverser from "@babel/traverse";

const traverse: typeof traverser = traverser.default;

export type Imports = { [key: string]: string };

export function collectImportDeclarations(ast: Node) {
  const imports: Imports = {};

  const importDeclarationVisitor = {
    ImportDeclaration({ node }: { parent: Node; node: ImportDeclaration }) {
      const headerFile = `${node.source.value.replace("./", "")}.h`;
      node.specifiers.forEach((specifier) => {
        if (specifier.type !== "ImportSpecifier") return;
        imports[specifier.imported.name] = headerFile;
      });
    },
  };

  traverse(ast, importDeclarationVisitor);

  return imports;
}
