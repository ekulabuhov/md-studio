export function arrayToDc(array: number[], perLine = 16, unit = 'b') {
  let str = '';
  for (let y = 0; y < Math.ceil(array.length / perLine); y++) {
    str += `    dc.${unit}    `;

    str += array
      .slice(y * perLine, Math.min(array.length, y * perLine + perLine))
      .map((el) => '0x' + (el || 0).toString(16).padStart(2, '0'))
      .join(', ');
    str += '\n';

    if ((y + 1) % 8 === 0) {
        str += '\n';
    }
  }
  return str;
}
