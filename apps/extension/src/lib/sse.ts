/** Incremental parser for text/event-stream; yields the data of each complete event. */
export class SseParser {
  private buffer = "";
  private data: string[] = [];

  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];
    for (;;) {
      const idx = this.buffer.search(/\r\n|\r|\n/);
      if (idx < 0) break;
      // A trailing "\r" may be the first half of "\r\n": wait for more input.
      if (this.buffer[idx] === "\r" && idx === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + (this.buffer.startsWith("\r\n", idx) ? 2 : 1));
      this.line(line, out);
    }
    return out;
  }

  end(): string[] {
    const out: string[] = [];
    if (this.buffer) {
      const rest = this.buffer.replace(/\r$/, "");
      this.buffer = "";
      this.line(rest, out);
    }
    this.line("", out);
    return out;
  }

  private line(line: string, out: string[]): void {
    if (line === "") {
      if (this.data.length > 0) out.push(this.data.join("\n"));
      this.data = [];
      return;
    }
    if (line.startsWith(":")) return;
    if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""));
  }
}
