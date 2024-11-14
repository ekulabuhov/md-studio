import { CallExpression, MemberExpression, Node } from "@babel/types";
import traverser from "@babel/traverse";
import { camelToSnakeCase } from "../src/app/utils";

const traverse: typeof traverser = traverser.default;

function collectMemberExpressions(ast: Node, code: string) {
  const memberExpressions: {
    start: number;
    end: number;
    parentType: string;
    isCallee: boolean;
    objectType: string;
    hasArguments: boolean;
  }[] = [];

  const memberExpressionVisitor = {
    MemberExpression(path: { parent: Node; node: MemberExpression }) {
      if (path.parent.type !== "MemberExpression") {
        memberExpressions.push({
          start: path.node.start,
          end: path.node.end,
          parentType: path.parent.type,
          isCallee: path.node === (path.parent as CallExpression).callee,
          // Use objectType to distinguish between local calls and lib calls:
          // MemberExpression: this.sprite.setAnim
          // ThisExpression: this.setCameraPosition
          objectType: path.node.object.type,
          hasArguments:
            path.parent.type === "CallExpression" &&
            path.parent.arguments.length > 0,
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

  traverse(ast, memberExpressionVisitor);

  return memberExpressions;
}

// Replaces this.posY with this->posY
// Replaces this.sprite.setAnim(...) with SPR_setAnim(this->sprite, ...)
export function fixMemberExpressions(
  ast: Node,
  code: string,
  className: string,
  classProperties: { key: string; type: string }[]
) {
  const memberExpressions = collectMemberExpressions(ast, code);

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

        const classProperty = classProperties.find(
          (cp) => cp.key === "*" + path[1]
        );
        if (classProperty && classProperty.type !== "Sprite") {
          memberClassName = camelToSnakeCase(classProperty.type).toUpperCase();
        }

        functionName = path[2];
        instance = `this->${path[1]}`;
      } else if (me.objectType === "ThisExpression") {
        // Replaces this.setCameraPosition(...) with CAMERA_setCameraPosition(this, ...)
        memberClassName = className.toUpperCase();
        functionName = path[1];
      } else if (me.objectType === "Identifier") {
        memberClassName = path[0].toUpperCase();
        functionName = path[1];
        instance = path[0];
      }
      newCode += `${memberClassName}_${functionName}${instance}`;
      if (me.hasArguments) {
        newCode += ", ";
      }
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
