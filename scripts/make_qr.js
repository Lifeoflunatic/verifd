#!/usr/bin/env node

/**
 * QR Code Generator for verifd Staging APK
 * Generates QR code PNG from Release URL
 */

const fs = require('fs');
const https = require('https');
const { createCanvas } = require('canvas');
const QRCode = require('qrcode');

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node make_qr.js <URL> [output.png]');
  process.exit(1);
}

const url = args[0];
const outputFile = args[1] || 'qr-verifd-staging.png';

// Configuration
const config = {
  width: 512,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  },
  errorCorrectionLevel: 'H'
};

async function generateQR() {
  try {
    console.log(`🎯 Generating QR code for: ${url}`);
    
    // Generate QR code
    const canvas = createCanvas(config.width, config.width);
    await QRCode.toCanvas(canvas, url, config);
    
    // Add label at bottom
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, config.width - 40, config.width, 40);
    
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('verifd Staging APK', config.width / 2, config.width - 15);
    
    // Save to file
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputFile, buffer);
    
    console.log(`✅ QR code saved to: ${outputFile}`);
    console.log(`   Size: ${buffer.length} bytes`);
    
    // Print ASCII version for logs
    const asciiQR = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log('\n📲 QR Code Preview:');
    console.log(asciiQR);
    
  } catch (error) {
    console.error(`❌ Error generating QR code: ${error.message}`);
    process.exit(1);
  }
}

// Run generator
generateQR();