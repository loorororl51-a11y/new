// Use global fetch available in Node 18+

class GofileService {
  constructor() {
    this.apiBase = 'https://api.gofile.io';
    this.uploadBase = process.env.GOFILE_UPLOAD_HOST || 'https://upload.gofile.io';
    this.apiToken = process.env.GOFILE_API_TOKEN; // optional
  }

  async uploadAsGuest(filePath) {
    const fs = require('fs');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    // Official global (or regional) upload endpoint
    const resp = await fetch(`${this.uploadBase}/uploadfile`, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`Gofile upload failed: ${resp.status}`);
    const data = await resp.json();
    if (!data || data.status !== 'ok' || !data.data) throw new Error('Gofile upload error');

    return {
      downloadPage: data.data.downloadPage,
      code: data.data.code,
      parentFolder: data.data.parentFolder
    };
  }

  // Creating direct links requires an API token and (often) premium account.
  // Not used by default in guest flow.
}

module.exports = GofileService;


