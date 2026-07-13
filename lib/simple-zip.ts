function crc32Table() {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c >>> 0
  }
  return table
}

const CRC_TABLE = crc32Table()

function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function writeUInt16LE(value: number) {
  const buf = Buffer.allocUnsafe(2)
  buf.writeUInt16LE(value & 0xffff, 0)
  return buf
}

function writeUInt32LE(value: number) {
  const buf = Buffer.allocUnsafe(4)
  buf.writeUInt32LE(value >>> 0, 0)
  return buf
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosDate, dosTime }
}

export function makeZip(files: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  const now = new Date()
  const { dosDate, dosTime } = dosDateTime(now)

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const data = file.data
    const checksum = crc32(data)

    const localHeader = Buffer.concat([
      writeUInt32LE(0x04034b50),
      writeUInt16LE(20),
      writeUInt16LE(0x0800),
      writeUInt16LE(0),
      writeUInt16LE(dosTime),
      writeUInt16LE(dosDate),
      writeUInt32LE(checksum),
      writeUInt32LE(data.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBuf.length),
      writeUInt16LE(0),
      nameBuf,
    ])

    localParts.push(localHeader, data)

    const centralHeader = Buffer.concat([
      writeUInt32LE(0x02014b50),
      writeUInt16LE(20),
      writeUInt16LE(20),
      writeUInt16LE(0x0800),
      writeUInt16LE(0),
      writeUInt16LE(dosTime),
      writeUInt16LE(dosDate),
      writeUInt32LE(checksum),
      writeUInt32LE(data.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBuf.length),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(0),
      writeUInt32LE(offset),
      nameBuf,
    ])
    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.concat([
    writeUInt32LE(0x06054b50),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(files.length),
    writeUInt16LE(files.length),
    writeUInt32LE(centralDirectory.length),
    writeUInt32LE(offset),
    writeUInt16LE(0),
  ])

  return Buffer.concat([...localParts, centralDirectory, end])
}
