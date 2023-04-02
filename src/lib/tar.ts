// Copyright (c) Rodrigo Speller. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

const _ = null;

const star_header = {
//field:    [ size  , default_value ] as [number, any],
  name:     [ 100   , _             ] as [number, any],
  mode:     [ 8     , '0000664'     ] as [number, any],
  uid:      [ 8     , 0             ] as [number, any],
  gid:      [ 8     , 0             ] as [number, any],
  size:     [ 12    , _             ] as [number, any],
  mtime:    [ 12    , epoch_utc_now ] as [number, any],
  chksum:   [ 8     , _             ] as [number, any],
  typeflag: [ 1     , 0             ] as [number, any],
  linkname: [ 100   , _             ] as [number, any],
  magic:    [ 6     , 'ustar'       ] as [number, any],
  version:  [ 2     , '00'          ] as [number, any],
  uname:    [ 32    , _             ] as [number, any],
  gname:    [ 32    , _             ] as [number, any],
  devmajor: [ 8     , _             ] as [number, any],
  devminor: [ 8     , _             ] as [number, any],
  prefix:   [ 131   , _             ] as [number, any],
  atime:    [ 12    , _             ] as [number, any],
  ctime:    [ 12    , _             ] as [number, any],
  padding:  [ 12    , _             ] as [number, any]
}

type TarFieldName = keyof typeof star_header;
type TarField = { name: string, offset: number, size: number, default: string };

export interface TarEntry {
  name: string,
  data: Uint8Array
}

export function createTar(entries: Iterable<TarEntry>) {
  const { headers, fields, blockSize } = initTar();
  
  // Calculate output buffer size and prepare chunks

  let outputBufferSize = 0;
  const chunks = Array.from(entries).map(entry => {
      const dataLength = entry.data.byteLength;
      const bufferSize = (Math.ceil(dataLength / blockSize) + 1) * blockSize;
      outputBufferSize += bufferSize;
      return { bufferSize, dataLength, info: entry, data: entry.data };
  });

  // Output chunks together

  const outputBuffer = new Uint8Array(outputBufferSize);
  chunks.reduce((offset, entry) => {
    const buffer = outputBuffer.subarray(offset);

    // Write header

    let chksum = fields.reduce(
      (sum, field) => sum + writeFieldValue(buffer, headers[field], (entry.info as any)[field]),
      256 // initial checksum for 8 blank (0x20) bytes
    )

    chksum += writeFieldValue(buffer, headers.size, entry.data.byteLength);
    writeFieldValue(buffer, headers.chksum, chksum);

    // Write data

    buffer.set(entry.data, blockSize)

    // Return next offset
    return offset + entry.bufferSize;
  }, 0)

  return outputBuffer;
}

function initTar() {
  const fields = Object.keys(star_header) as TarFieldName[];

  const { h: headers } = fields
    .reduce(
      (state, field) => {
        let [fieldSize, fieldDefValue] = star_header[field];

        if (typeof fieldDefValue === 'function') {
          fieldDefValue = fieldDefValue();
        }

        state.h[field] = {
          name: field,
          offset: state.o,
          size: fieldSize,
          default: fieldDefValue,
        }

        state.o += fieldSize;

        return state;
      },
      // o: offset, h: headers
      { o: 0, h: {} as Record<TarFieldName, TarField> }
    );

  return { headers, fields, blockSize: 512 }
}

function epoch_utc_now() {
  return Math.floor(Number(new Date()) / 1000)
}

function num2oct(num: number, length: number) {
  return num.toString(8).padStart(length, '0');
}

function writeFieldValue(buffer: Uint8Array, field: TarField, value: any) {
  value = value ?? field.default;

  if (value == null) {
    return 0;
  }

  if (typeof value === 'number') {
    value = num2oct(value, field.size - 1);
  }

  let chksum = 0;

  const offset = field.offset;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    buffer[offset + i] = c
    chksum += c
  }

  return chksum;
}
