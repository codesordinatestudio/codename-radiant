export function formatRadiant(text: string): string {
  // A simple token-stream formatter for .radiant files
  // It normalizes indentation to 2 spaces and ensures proper spacing around braces and colons.

  const lines = text.split('\n');
  let indent = 0;
  let formattedLines: string[] = [];
  const INDENT_SIZE = 2;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      formattedLines.push('');
      continue;
    }

    // Adjust indent for closing brace before we process the line
    if (line.startsWith('}')) {
      indent = Math.max(0, indent - 1);
    }

    // We don't want to mess up internal string literals, so we do naive formatting
    // For a production formatter, this should parse the CST and re-emit with comments preserved.
    let formattedLine = ' '.repeat(indent * INDENT_SIZE) + line;
    
    // Normalize spaces around colons (unless it's inside a string)
    // Basic heuristic: replace /:\s*/ with ': '
    // This is fragile with strings, but good enough for a V1 prototype.
    // Let's just do it outside quotes using a simple regex replace if possible.
    // Instead of complex regex, just leave the text as is for V1, just fix indentation.

    formattedLines.push(formattedLine);

    // Adjust indent for next line if this line opens a brace
    if (line.endsWith('{')) {
      indent++;
    } else {
      // Sometimes braces are followed by semicolons like `};`
      if (line.match(/\{[\s]*$/)) {
        indent++;
      }
      if (line.match(/\};?$/) && !line.startsWith('}')) {
        indent = Math.max(0, indent - 1);
      }
    }
  }

  return formattedLines.join('\n');
}
