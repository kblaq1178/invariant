export function diffLines(value: string) {
  let old = 0;
  let current = 0;
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) { old = Number(hunk[1]); current = Number(hunk[2]); }
    const meta = text.startsWith("+++") || text.startsWith("---") || !!hunk || (!old && !current) || text.startsWith("\\");
    const add = !meta && text.startsWith("+");
    const remove = !meta && text.startsWith("-");
    return { text, before: meta || add ? "" : old++, after: meta || remove ? "" : current++,
      tone: meta ? "meta" : add ? "add" : remove ? "del" : "context" };
  });
}
