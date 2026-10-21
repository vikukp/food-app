// RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet would
// run as a formula (=, +, -, @), since item and employee names are typed by people.
export function csvCell(value: string | number | null | undefined) {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(",");
}
