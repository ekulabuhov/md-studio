// Converts *.ts file to corresponding *.c and *.h
// Run: npm run parser src/app/player.ts ~/Documents/MDStudio
import fs from "fs";
import { parse } from "./parser.mjs";

const inputFilePath = process.argv[2];
const inputFileName = inputFilePath.split("/").pop();
let code = fs.readFileSync(inputFilePath).toString();
// Will output to provided dir or to a dir above the file
// Input: /scripts/player.ts
// Output: ../src/player.c, ../inc/player.h
const outputDir =
  process.argv[3] || inputFilePath.split("/").slice(0, -1).join("/") + "/..";
const outputCFilePath = `${outputDir}/src/${inputFileName.replace(
  ".ts",
  ".c"
)}`;
const outputHFilePath = `${outputDir}/inc/${inputFileName.replace(
  ".ts",
  ".h"
)}`;

const { className, headerImports, props, forwardDeclarations, output } = parse(code, inputFileName);

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
const warningHeader = `// Generated from ${inputFileName}. DO NOT EDIT.\n`;
fs.writeFileSync(outputCFilePath, warningHeader + output);

// console.log(props);
// console.log(output);
// console.log({ headerImports });
// console.log({ imports });