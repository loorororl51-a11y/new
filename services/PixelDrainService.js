class PixelDrainService {
  constructor() {
    this.apiBase = process.env.PIXELDRAIN_API_BASE || 'https://pixeldrain.com/api';
    this.apiToken = process.env.PIXELDRAIN_API_TOKEN || '';
  }

  getAuthHeaders() {
    if (!this.apiToken) return {};
    // Use Bearer token by default
    return { 'authorization': `Bearer ${this.apiToken}` };
  }

  async uploadFile(filePath) {
    const fs = require('fs');
    const path = require('path');
    const form = new FormData();
    const buffer = await fs.promises.readFile(filePath);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    form.append('file', blob, path.basename(filePath));

    const resp = await fetch(`${this.apiBase}/file`, {
      method: 'POST',
      headers: { ...this.getAuthHeaders() },
      body: form
    });

    if (!resp.ok) {
      throw new Error(`PixelDrain upload failed: ${resp.status}`);
    }
    const data = await resp.json();
    if (!data || !data.id) {
      throw new Error('PixelDrain upload error: missing id');
    }

    const id = data.id;
    return {
      id,
      pageUrl: `https://pixeldrain.com/u/${id}`,
      directUrl: `${this.apiBase}/file/${id}?download`
    };
  }
}

module.exports = PixelDrainService;


