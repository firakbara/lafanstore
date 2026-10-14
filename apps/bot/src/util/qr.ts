import QRCode from 'qrcode';

const MAX_QR_PAYLOAD = 4096;

/** Render a QR payload (e.g. QRIS string) to PNG bytes. */
export async function qrPng(payload: string): Promise<Uint8Array> {
  if (payload.length > MAX_QR_PAYLOAD) throw new Error('QR payload too large');
  const buf = await QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 });
  return new Uint8Array(buf);
}
