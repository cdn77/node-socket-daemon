import { Transform, TransformCallback } from 'stream';

type PrefixFactory = () => string;

function createPrefixFactory(format: string): PrefixFactory {
  if (format.includes('{date}')) {
    return () => format.replace(/{date}/g, new Date().toJSON());
  }

  return () => format;
}

function normalizeChunk(chunk: any): string {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString();
  }

  if (typeof chunk === 'string') {
    return chunk;
  }

  throw new Error('Invalid chunk');
}

export class OutputProcessor extends Transform {
  private readonly buffer: string[];

  private readonly getPrefix: PrefixFactory;

  constructor(prefix: string) {
    super();
    this.buffer = [];
    this.getPrefix = createPrefixFactory(prefix);
  }

  // eslint-disable-next-line no-underscore-dangle
  _transform(chunk: any, encoding: string, callback: TransformCallback) {
    let buf: string = normalizeChunk(chunk);
    let i = buf.indexOf('\n') + 1;

    while (i > 0) {
      const segment = buf.substring(0, i);
      buf = buf.substring(i);
      i = buf.indexOf('\n') + 1;

      if (this.buffer.length) {
        this.push(this.formatLine(this.buffer.concat(segment).join('')));
        this.buffer.splice(0, this.buffer.length);
      } else {
        this.push(this.formatLine(segment));
      }
    }

    if (buf.length) {
      this.buffer.push(buf);
    }

    callback();
  }

  private formatLine(line: string): string {
    return `${this.getPrefix()} ${line}`;
  }
}
