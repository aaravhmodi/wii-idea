import QRCode from 'qrcode';
export function drawQR(canvas, url) {
  return QRCode.toCanvas(canvas, url, { width: 140, margin: 2, color: { dark: '#101720', light: '#ffffff' }, errorCorrectionLevel: 'M' });
}
