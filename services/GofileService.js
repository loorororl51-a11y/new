// Use global fetch available in Node 18+

class GofileService {
  constructor() {
    this.apiBase = 'https://api.gofile.io';
  }

  async getBestServer() {
    const resp = await fetch(`${this.apiBase}/getServer`);
    if (!resp.ok) throw new Error(`Gofile getServer failed: ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 'ok') throw new Error(`Gofile getServer error: ${data.status}`);
    return data.data.server;
  }

  async uploadAsGuest(filePath) {
    const fs = require('fs');
    const FormData = require('form-data');
    const server = await this.getBestServer();
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    const uploadUrl = `https://${server}.gofile.io/uploadFile`;

    const resp = await fetch(uploadUrl, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`Gofile upload failed: ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 'ok') throw new Error(`Gofile upload error: ${data.status}`);
    const code = data.data.code;
    const directLink = await this.getDirectLink(code).catch(() => null);
    return {
      downloadPage: data.data.downloadPage,
      code,
      parentFolder: data.data.parentFolder,
      directLink
    };
  }

  async getDirectLink(code) {
    const url = `${this.apiBase}/getContent?contentId=${encodeURIComponent(code)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Gofile getContent failed: ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 'ok') throw new Error(`Gofile getContent error: ${data.status}`);
    const contents = data.data.contents || {};
    const first = Object.values(contents)[0];
    return first && first.directLink ? first.directLink : null;
  }
}

module.exports = GofileService;


